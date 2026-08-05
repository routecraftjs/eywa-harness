import { agent } from "@routecraft/ai";
import {
  craft,
  direct,
  http,
  mail,
  only,
  otherwise,
  when,
} from "@routecraft/routecraft";
import { env } from "../env.js";
import type { TicketSummary } from "../lib/planka.js";
import { parseApprovalAction } from "../lib/approvals.js";

/**
 * Inbound ticket event from the Planka mock board.
 *
 * Planka POSTs to `/webhooks/planka` whenever a card is created or updated,
 * signed with `PLANKA_WEBHOOK_SECRET` via HMAC-SHA256 (hex). The source
 * verifies that signature against the raw request bytes and rejects with 401
 * before the route runs, so nothing below executes on an unsigned request.
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

export default craft()
  .id("process-ticket-event")
  .from<PlankaWebhookPayload>(
    http({
      path: "/webhooks/planka",
      method: "POST",
      auth: "skip",
      signature: {
        header: "x-webhook-signature",
        secret: env.PLANKA_WEBHOOK_SECRET,
        scheme: "hmac-sha256-hex",
      },
    }),
  )
  // Cheap synchronous pre-filter: does the card even carry an approval
  // payload? Ordinary board traffic never does, so it skips the branch and
  // the extra Planka call entirely.
  .transform((body: PlankaWebhookPayload) => ({
    channel: "ticket" as const,
    event: body.event,
    id: body.data?.item?.id ?? "",
    title: body.data?.item?.name,
    description: body.data?.item?.description ?? "",
    candidate: parseApprovalAction(body.data?.item?.description) !== null,
  }))
  .choice(
    when(
      (ex) => ex.body.candidate && ex.body.id !== "",
      (b) =>
        b
          // Re-read the card from Planka rather than trusting the webhook:
          // the authorisation is the card's CURRENT list, and the payload
          // that gets sent must be the one on the board right now.
          .enrich(
            direct<unknown, TicketSummary>("get-ticket"),
            only((ticket: TicketSummary) => ticket, "ticket"),
          )
          // Not yet approved: this is Aria's own draft sitting where she
          // left it, so drop it. Without this she would be woken by the
          // very card she just filed.
          .filter(
            (ex) =>
              ex.body.ticket.status.toLowerCase() ===
                env.PLANKA_APPROVAL_LIST.toLowerCase() &&
              parseApprovalAction(ex.body.ticket.body) !== null,
          )
          .process((ex) => {
            const action = parseApprovalAction(ex.body.ticket.body)!;
            return {
              ...ex,
              headers: { ...ex.headers, "x-approval-ticket": ex.body.id },
              body: {
                to: action.to,
                subject: action.subject,
                text: action.body,
                inReplyTo: undefined,
              },
            };
          })
          .to(mail({ account: "default" }))
          .process((ex) => ({
            ...ex,
            body: {
              id: ex.headers["x-approval-ticket"] as string,
              text: "Approved and sent. Recorded by the harness, not by Aria.",
            },
          }))
          .to(direct("comment-on-ticket"))
          .transform((): Handled => ({ handled: "approved-and-sent" })),
    ),
    otherwise((b) =>
      b.to(agent("aria")).transform((): Handled => ({ handled: "agent" })),
    ),
  );
