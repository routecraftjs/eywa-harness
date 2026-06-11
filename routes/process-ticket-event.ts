import { agent } from "@routecraft/ai";
import { craft, type Source } from "@routecraft/routecraft";
import { createServer } from "node:http";
import { env } from "../env.js";
import { verifySignature } from "../lib/webhook-signature.js";

/**
 * Inbound ticket event from the Planka mock board.
 *
 * Planka POSTs to `/webhooks/planka` whenever a card is created or updated,
 * signed with `PLANKA_WEBHOOK_SECRET` via HMAC-SHA256 (hex). The route
 * verifies the signature, normalises the payload, and hands the change to
 * Aria for follow-up.
 */
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
  .transform((body: PlankaWebhookPayload) => ({
    channel: "ticket" as const,
    event: body.event,
    ticketId: body.data?.item?.id,
    title: body.data?.item?.name,
    description: body.data?.item?.description ?? "",
  }))
  .to(agent("aria"));
