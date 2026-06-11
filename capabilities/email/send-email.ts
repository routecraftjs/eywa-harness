import {
  craft,
  direct,
  mail,
  type Destination,
  type MailSendPayload,
  type MailSendResult,
} from "@routecraft/routecraft";
import { z } from "zod";
import { smtpOptions } from "../../lib/mail-config.js";

const InputSchema = z.object({
  to: z.string().email().describe("Recipient email address."),
  subject: z.string().min(1).describe("Email subject line."),
  body: z.string().min(1).describe("Plain-text body. The agent's reply or note."),
});

// The mail() overloads cannot tell send options from fetch options (both
// accept host/port/secure/auth), so TypeScript resolves this call to the
// fetch destination. The runtime dispatches on usage, not options, so the
// cast only corrects the type.
const sendMail = mail(smtpOptions) as unknown as Destination<
  MailSendPayload,
  MailSendResult
>;

export default craft()
  .id("send-email")
  .description(
    "Send a plain-text email through the demo mail server. Use sparingly: only when the requester actually needs an email reply.",
  )
  .input({ body: InputSchema })
  .from<z.infer<typeof InputSchema>>(direct())
  .transform((body) => ({
    to: body.to,
    subject: body.subject,
    text: body.body,
  }))
  .to(sendMail);
