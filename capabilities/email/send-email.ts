import { craft, direct, mail } from "@routecraft/routecraft";
import { z } from "zod";

const InputSchema = z.object({
  to: z.string().email().describe("Recipient email address."),
  subject: z.string().min(1).describe("Email subject line."),
  body: z.string().min(1).describe("Plain-text body. The agent's reply or note."),
});

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
  .to(mail());
