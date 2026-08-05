import { agent } from "@routecraft/ai";
import { craft, http, mail, otherwise, when } from "@routecraft/routecraft";
import { env } from "../env.js";
import { commentOnTicket, getTicket } from "../lib/clients/planka.js";
import { parseApprovalAction, type ApprovalAction } from "../lib/approvals.js";

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
