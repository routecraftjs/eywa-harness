import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { updateTicketStatus } from "../../lib/clients/planka.js";
import { TicketSchema } from "../../lib/schemas/ticket.js";

const InputSchema = z.object({
  id: z.string().describe("The ticket id to move."),
  status: z
    .string()
    .describe(
      "Target status. Must match a board column name (case-insensitive), e.g. 'In Progress', 'Done'.",
    ),
});

export default craft()
  .id("update-ticket-status")
  .description(
    "Move a ticket to a different board column. Use to mark progress: 'In Progress' when starting, 'Done' when finished.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
  .from(direct())
  .process(async (ex) => {
    ex.body = await updateTicketStatus(ex.body.id, ex.body.status);
    return ex;
  });
