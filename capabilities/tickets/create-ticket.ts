import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { createTicket } from "../../lib/clients/planka.js";
import { TicketSchema } from "../../lib/schemas/ticket.js";

const InputSchema = z.object({
  title: z.string().min(1).describe("Short ticket title visible on the board."),
  body: z
    .string()
    .optional()
    .describe("Markdown body. Include all relevant context the human will need."),
  status: z
    .string()
    .optional()
    .describe(
      "Initial board column. Defaults to the first list (typically 'Backlog').",
    ),
  labels: z
    .array(z.string())
    .optional()
    .describe(
      "Labels to attach. Unknown labels are skipped silently for the demo.",
    ),
});

export default craft()
  .id("create-ticket")
  .description(
    "Create a new ticket on the demo Kanban board. Use this to file actionable work the human should review.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
  .from(direct())
  .process(async (ex) => {
    const ticket = await createTicket(ex.body);
    ex.body = ticket;
    return ex;
  });
