import {
  craft,
  direct,
  http,
  only,
  type HttpResult,
} from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import {
  authHeader,
  toTicket,
  type BoardContext,
  type PlankaCard,
} from "../../lib/planka.js";
import { TicketSchema } from "../../lib/schemas/ticket.js";
import { requires } from "../../lib/identity.js";
import { SCOPES } from "../../lib/scopes.js";

const InputSchema = z.object({
  id: z.string().describe("The ticket id (Planka card id)."),
});

type Input = z.infer<typeof InputSchema>;
type WithAuth = Input & { token: string; board: BoardContext };

export default craft()
  .id("get-ticket")
  .description(
    "Fetch a ticket by id. Use to look up status, body, and current column before deciding what to do next.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
  .authorize(requires(SCOPES.TICKETS_READ))
  .from(direct())
  .enrich(
    direct<unknown, string>("planka-token"),
    only((token: string) => token, "token"),
  )
  .enrich(
    direct<unknown, BoardContext>("planka-board"),
    only((board: BoardContext) => board, "board"),
  )
  .enrich(
    http<WithAuth, { item: PlankaCard }>({
      url: (ex) => `${env.PLANKA_BASE_URL}/api/cards/${ex.body.id}`,
      headers: (ex) => authHeader(ex.body.token),
    }),
    only((r: HttpResult<{ item: PlankaCard }>) => r.body.item, "card"),
  )
  .transform((body) => toTicket(body.card, body.board));
