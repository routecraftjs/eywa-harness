import { agent } from "@routecraft/ai";
import { craft, mail } from "@routecraft/routecraft";
import { env } from "../env.js";

/**
 * Inbound email entry point.
 *
 * Polls the demo Greenmail inbox for new mail, hands the message to Aria as
 * unstructured input, and lets her decide what to do (file a ticket, write
 * to the knowledge base, send a reply, or just acknowledge).
 *
 * The harness has no `choice` block on the inbox today: every email goes
 * straight to the agent. As patterns emerge, deterministic sub-routes can
 * earn their way in by adding `when()` predicates here.
 */
export default craft()
  .id("process-inbox")
  .from(
    mail("INBOX", {
      account: "default",
      unseen: true,
      markSeen: true,
      pollIntervalMs: env.MAIL_POLL_INTERVAL_MS,
    }),
  )
  .transform((body) => ({
    channel: "email" as const,
    from: body.from,
    subject: body.subject,
    text: body.text ?? body.textAsHtml ?? "",
    messageId: body.messageId,
  }))
  .to(agent("aria"));
