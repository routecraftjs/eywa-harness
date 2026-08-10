import { agent } from "@routecraft/ai";
import {
  craft,
  direct,
  http,
  only,
  otherwise,
  when,
} from "@routecraft/routecraft";
import { env } from "../env.js";
import type { TicketSummary } from "../lib/planka.js";
import { parseApprovalAction } from "../lib/approvals.js";
import {
  approvedByBoard,
  ARIA,
  boardEvent,
  boardTriage,
} from "../lib/identity.js";

/**
 * Inbound ticket event from the Planka mock board.
 *
 * Planka POSTs to `/webhooks/planka` whenever a card is created or updated,
 * presenting `PLANKA_WEBHOOK_SECRET` as a bearer token. The http plugin's
 * verifier checks it and rejects with 401 before the route runs, so nothing
 * below executes for an unauthenticated caller. `lib/webhook-auth.ts` explains
 * why this is a token rather than a signature, and what that costs.
 *
 * The two branches run on deliberately different authority. The approval
 * branch mints `mail:send`, and it does so only after the card has been
 * re-read and found sitting in the approved list: a human put it there, and
 * Aria has no capability that can. The agent branch never sees that scope, so
 * a card cannot talk her into sending anything.
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
      // The plugin's apiKey verifier in craft.config.ts runs first and answers
      // 401 itself, so nothing below executes for a caller that cannot present
      // PLANKA_WEBHOOK_SECRET.
      auth: "required",
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
          // Read-only authority for the re-read below. The webhook verified,
          // which is enough to look at a card and no more; whether anything
          // may be sent is still an open question at this point.
          .authenticate((ex) => boardEvent(ex.body.id))
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
          // Only now is mail:send minted: the caller authenticated, and a
          // human moved the card. Neither fact alone is enough, and the agent
          // supplies neither of them.
          // Sanctioned minting site: reached only after the webhook
          // authenticated AND the card was re-read from the board in the
          // approved list, which only a human can arrange.
          //
          // The restrict-principal-minting lint rule does NOT see this call,
          // because it sits inside a choice branch rather than on the route's
          // top-level chain. Minting inside a branch is exactly where it most
          // wants looking at; reported upstream.
          .authenticate((ex) => approvedByBoard(ex.body.id))
          .process((ex) => {
            const action = parseApprovalAction(ex.body.ticket.body)!;
            return {
              ...ex,
              headers: { ...ex.headers, "x-approval-ticket": ex.body.id },
              body: {
                to: action.to,
                subject: action.subject,
                body: action.body,
                inReplyTo: undefined,
              },
            };
          })
          // Through the capability, not `mail()` directly. Reaching for the
          // adapter here would send without ever testing `mail:send`, leaving
          // the scope minted above decorative: the branch would be safe only
          // because of the filter, and the authorization layer would be
          // asserting nothing. Every outbound mail goes through this route so
          // that the check is real everywhere.
          .to(direct("send-email"))
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
      b
        // A card is not its author: the event says something moved, never who
        // may act on it. So Aria triages as the board, on the same authority
        // the mailbox gets, and like the mailbox she cannot send mail. She can
        // park a draft, which is the honest answer when a card asks her to
        // write to someone.
        // Sanctioned minting site (also invisible to the lint rule, see
        // above): a channel identity for triage, with no mail:send in it.
        .authenticate((ex) => boardTriage(ex.body.id))
        .delegate(() => ({ actor: ARIA }))
        .to(agent("aria"))
        .transform((): Handled => ({ handled: "agent" })),
    ),
  );
