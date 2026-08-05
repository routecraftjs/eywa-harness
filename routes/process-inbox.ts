import { agent } from "@routecraft/ai";
import { craft, mail, MailHeaders } from "@routecraft/routecraft";
import { env } from "../env.js";

/**
 * Inbound email entry point.
 *
 * Polls the demo Greenmail inbox for new mail, hands the message to Aria as
 * unstructured input, and lets her decide what to do (file a ticket, write
 * to the knowledge base, send a reply, or just acknowledge).
 *
 * The mail source puts the content on the body and the envelope on
 * `routecraft.mail.*` headers, so the agent input is assembled in a
 * `.process()` step that can see both.
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
  .process((ex) => ({
    ...ex,
    body: {
      channel: "email" as const,
      from: ex.headers[MailHeaders.FROM] as string,
      subject: ex.headers[MailHeaders.SUBJECT] as string,
      text: ex.body.text ?? ex.body.html ?? "",
      messageId: ex.headers[MailHeaders.MESSAGE_ID] as string,
    },
  }))
  .to(agent("aria"));
