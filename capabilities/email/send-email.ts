import { craft, direct, mail } from "@routecraft/routecraft";
import { z } from "zod";

const InputSchema = z.object({
  to: z.string().email().describe("Recipient email address."),
  subject: z.string().min(1).describe("Email subject line."),
  body: z.string().min(1).describe("Plain-text body. The agent's reply or note."),
  inReplyTo: z
    .string()
    .optional()
    .describe(
      "Optional message id to thread the reply (only used when replying to an existing thread).",
    ),
});

export default craft()
  .id("send-email")
  .description(
    "Send a plain-text email through the demo mail server. Use sparingly: only when the requester actually needs an email reply.",
  )
  .input({ body: InputSchema })
  .from(direct())
  .to(
    mail({
      account: "default",
      action: "send",
      to: (ex) => ex.body.to,
      subject: (ex) => ex.body.subject,
      text: (ex) => ex.body.body,
      headers: (ex) =>
        ex.body.inReplyTo
          ? { "In-Reply-To": ex.body.inReplyTo, References: ex.body.inReplyTo }
          : undefined,
    }),
  );
