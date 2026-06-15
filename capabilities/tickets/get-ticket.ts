import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { getTicket } from "../../lib/clients/planka.js";
import { TicketSchema } from "../../lib/schemas/ticket.js";

const InputSchema = z.object({
  id: z.string().describe("The ticket id (Planka card id)."),
});

export default craft()
  .id("get-ticket")
  .description(
    "Fetch a ticket by id. Use to look up status, body, and current column before deciding what to do next.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
  .from(direct())
  .transform((body) => getTicket(body.id));
