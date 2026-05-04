import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { commentOnTicket } from "../../lib/clients/planka.js";

const InputSchema = z.object({
  id: z.string().describe("The ticket id to comment on."),
  text: z
    .string()
    .min(1)
    .describe("Comment body. Markdown is supported. Be concise and useful."),
});

const OutputSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  text: z.string(),
  createdAt: z.string(),
});

export default craft()
  .id("comment-on-ticket")
  .description(
    "Add a comment to an existing ticket. Use to record progress, ask the human a question, or summarise what you did.",
  )
  .input({ body: InputSchema })
  .output({ body: OutputSchema })
  .from(direct())
  .process(async (ex) => {
    ex.body = await commentOnTicket(ex.body.id, ex.body.text);
    return ex;
  });
