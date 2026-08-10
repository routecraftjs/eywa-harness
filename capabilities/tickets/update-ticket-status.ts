import {
  craft,
  direct,
  http,
  only,
  type Exchange,
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
  id: z.string().describe("The ticket id to move."),
  status: z
    .string()
    .describe(
      "Target status. Must match a board column name (case-insensitive), e.g. 'In Progress', 'Done'.",
    ),
});

type Input = z.infer<typeof InputSchema>;
type WithAuth = Input & { token: string; board: BoardContext };

/**
 * Resolve the target column, failing loudly when it does not exist. Naming a
 * column that is not on the board is an agent mistake worth surfacing, not
 * something to paper over by dropping the card somewhere plausible.
 */
const targetListId = (body: WithAuth): string => {
  const listId = body.board.listIds[body.status.toLowerCase()];
  if (!listId) {
    throw new Error(
      `Planka list "${body.status}" not found. Available: ${Object.keys(
        body.board.listIds,
      ).join(", ")}`,
    );
  }
  return listId;
};

export default craft()
  .id("update-ticket-status")
  .description(
    "Move a ticket to a different board column. Use to mark progress: 'In Progress' when starting, 'Done' when finished.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
  .authorize(requires(SCOPES.TICKETS_WRITE))
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
      method: "PATCH",
      url: (ex) => `${env.PLANKA_BASE_URL}/api/cards/${ex.body.id}`,
      headers: (ex) => authHeader(ex.body.token),
      body: (ex: Exchange<WithAuth>) => ({
        listId: targetListId(ex.body),
        position: 65535,
      }),
    }),
    only((r: HttpResult<{ item: PlankaCard }>) => r.body.item, "card"),
  )
  .transform((body) => toTicket(body.card, body.board));
