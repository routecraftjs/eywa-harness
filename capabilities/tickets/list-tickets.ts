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

const InputSchema = z.object({
  status: z
    .string()
    .optional()
    .describe(
      "Only return tickets in this column, e.g. 'Backlog'. Omit for the whole board.",
    ),
});

const ResultSchema = z.object({ tickets: z.array(TicketSchema) });

type Input = z.infer<typeof InputSchema>;
type WithAuth = Input & { token: string; board: BoardContext };

/**
 * The whole board in one call.
 *
 * Planka returns every card alongside the board, so filtering by column
 * happens here rather than in a per-column request. Without this the agent
 * could only fetch cards whose id it already knew, which makes "look over
 * the board" impossible: it is what the heartbeat route actually needs.
 */
export default craft()
  .id("list-tickets")
  .description(
    "List tickets on the board, newest first, optionally filtered by column. Use this to review what is open before deciding whether anything needs attention.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
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
    http<WithAuth, { included?: { cards?: PlankaCard[] } }>({
      url: (ex) => `${env.PLANKA_BASE_URL}/api/boards/${ex.body.board.boardId}`,
      headers: (ex) => authHeader(ex.body.token),
    }),
    only(
      (r: HttpResult<{ included?: { cards?: PlankaCard[] } }>) =>
        r.body.included?.cards ?? [],
      "cards",
    ),
  )
  .transform((body) => {
    const wanted = body.status?.toLowerCase();
    return {
      tickets: body.cards
        .map((card) => toTicket(card, body.board))
        .filter((ticket) => (wanted ? ticket.status === wanted : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  });
