import { agent } from "@routecraft/ai";
import { craft, mail, MailHeaders } from "@routecraft/routecraft";
import { env } from "../env.js";
import { ARIA, mailbox } from "../lib/identity.js";

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
 * The showcase has no `choice` block on the inbox today: every email goes
 * straight to the agent. As patterns emerge, deterministic sub-routes can
 * earn their way in by adding `when()` predicates here.
 *
 * A run triggered by mail acts as the MAILBOX, not as the sender. A `From:`
 * header names who wrote in and says nothing about what they may ask an agent
 * to do, and this demo's mail server will accept any address anyone claims.
 * The mailbox identity therefore has no `mail:send`: Aria can draft a reply
 * from an email, and a human moves a card to actually send it.
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
  // eslint-disable-next-line @routecraft/routecraft/restrict-principal-minting -- the sanctioned mail channel boundary. Mints the mailbox's own identity, never the sender's, and that identity cannot send mail
  .authenticate((ex) => mailbox(String(ex.headers[MailHeaders.FROM] ?? "")))
  .delegate(() => ({ actor: ARIA }))
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
