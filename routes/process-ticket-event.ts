import { agent } from "@routecraft/ai";
import {
  craft,
  mail,
  otherwise,
  when,
  type Source,
} from "@routecraft/routecraft";
import { createServer } from "node:http";
import { env } from "../env.js";
import { commentOnTicket, getTicket } from "../lib/clients/planka.js";
import { parseApprovalAction, type ApprovalAction } from "../lib/approvals.js";
import { verifySignature } from "../lib/webhook-signature.js";

/**
 * Inbound ticket event from the Planka mock board.
 *
 * Planka POSTs to `/webhooks/planka` whenever a card is created or updated,
 * signed with `PLANKA_WEBHOOK_SECRET` via HMAC-SHA256 (hex). The route
 * verifies the signature, normalises the payload, and hands the change to
 * Aria for follow-up.
 */
/** Both choice branches converge on this so the route has one output type. */
interface Handled {
  handled: string;
}

interface PlankaWebhookPayload {
  event: string;
  data?: {
    item?: {
      id?: string;
      name?: string;
      description?: string | null;
    };
  };
}

/**
 * Routecraft 0.6 ships an `http()` server source, but it parses the body
 * before the route sees it, and HMAC signatures must be verified against the
 * exact raw bytes. Until the framework exposes the raw request body, the
 * webhook listener stays a custom source carrying the raw body and signature
 * header for the HMAC check downstream.
 */
const plankaWebhook: Source<PlankaWebhookPayload> = {
  subscribe(sub) {
    const server = createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/webhooks/planka") {
        res.statusCode = 404;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let payload: PlankaWebhookPayload;
        try {
          payload = JSON.parse(raw) as PlankaWebhookPayload;
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        const signature = req.headers["x-webhook-signature"];
        sub
          .emit({
            message: payload,
            headers: {
              "x-routecraft-http-raw-body": raw,
              "x-webhook-signature": Array.isArray(signature)
                ? signature[0]
                : signature,
            },
          })
          .then(() => {
            res.statusCode = 204;
            res.end();
          })
          .catch(() => {
            res.statusCode = 500;
            res.end();
          });
      });
    });
    sub.signal.addEventListener("abort", () => server.close());
    server.listen(env.APP_PORT, env.APP_HOST, () => sub.ready());
  },
};

export default craft()
  .id("process-ticket-event")
  .from(plankaWebhook)
  .filter((ex) => {
    const raw = ex.headers["x-routecraft-http-raw-body"] as string | undefined;
    const signature = ex.headers["x-webhook-signature"] as string | undefined;
    if (!raw || !signature) return false;
    return verifySignature({
      body: raw,
      signature,
      secret: env.PLANKA_WEBHOOK_SECRET,
      scheme: "hmac-sha256-hex",
    });
  })
  // Resolve the card's current list before branching, because a choice
  // predicate is synchronous and the webhook payload does not name the list.
  // A lookup failure is not fatal: the event simply goes to the agent.
  .transform(async (body: PlankaWebhookPayload) => {
    const base = {
      channel: "ticket" as const,
      event: body.event,
      ticketId: body.data?.item?.id,
      title: body.data?.item?.name,
      description: body.data?.item?.description ?? "",
      approved: null as ApprovalAction | null,
    };
    if (!base.ticketId) return base;
    try {
      const ticket = await getTicket(base.ticketId);
      if (ticket.status.toLowerCase() !== env.PLANKA_APPROVAL_LIST.toLowerCase()) {
        return base;
      }
      return { ...base, approved: parseApprovalAction(ticket.body) };
    } catch {
      return base;
    }
  })
  .choice(
    // A human moved a card carrying a drafted action into the approval list.
    // That move is the authorisation, so this branch executes it directly:
    // the agent is not consulted and cannot approve its own request.
    when(
      (ex) => ex.body.approved !== null,
      (b) =>
        b
          .process((ex) => ({
            ...ex,
            headers: { ...ex.headers, "x-approval-ticket": ex.body.ticketId },
            body: {
              to: ex.body.approved!.to,
              subject: ex.body.approved!.subject,
              text: ex.body.approved!.body,
            },
          }))
          .to(mail({ account: "default" }))
          .process(async (ex) => {
            const ticketId = ex.headers["x-approval-ticket"] as string;
            await commentOnTicket(
              ticketId,
              "Approved and sent. Recorded by the harness, not by Aria.",
            );
            return ex;
          })
          .transform((): Handled => ({ handled: "approved-and-sent" })),
    ),
    otherwise((b) =>
      b.to(agent("aria")).transform((): Handled => ({ handled: "agent" })),
    ),
  );
