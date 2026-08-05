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
  pickListId,
  toTicket,
  type BoardContext,
  type PlankaCard,
} from "../../lib/planka.js";
import { TicketSchema } from "../../lib/schemas/ticket.js";

const InputSchema = z.object({
  title: z.string().min(1).describe("Short ticket title visible on the board."),
  body: z
    .string()
    .optional()
    .describe(
      "Markdown body. Include all relevant context the human will need.",
    ),
  status: z
    .string()
    .optional()
    .describe(
      "Initial board column. Defaults to the first list (typically 'Backlog').",
    ),
  labels: z
    .array(z.string())
    .optional()
    .describe("Labels to note on the card, rendered into the description."),
});

type Input = z.infer<typeof InputSchema>;
type WithAuth = Input & { token: string; board: BoardContext };

/**
 * Labels ride in the description rather than as Planka label objects: the
 * previous client attached them with one extra request per label, each
 * swallowing its own failure, which meant labels silently did nothing
 * whenever the seeded board lacked them. Rendering them keeps the
 * information visible to a human for one fewer round trip.
 */
const describe = (body: Input): string | null => {
  const labels = body.labels?.length
    ? `\n\n_Labels: ${body.labels.join(", ")}_`
    : "";
  const text = `${body.body ?? ""}${labels}`.trim();
  return text.length > 0 ? text : null;
};

export default craft()
  .id("create-ticket")
  .description(
    "Create a new ticket on the demo Kanban board. Use this to file actionable work the human should review.",
  )
  .input({ body: InputSchema })
  .output({ body: TicketSchema })
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
      method: "POST",
      url: (ex) =>
        `${env.PLANKA_BASE_URL}/api/lists/${pickListId(
          ex.body.board.listIds,
          ex.body.status,
        )}/cards`,
      headers: (ex) => authHeader(ex.body.token),
      // Annotated because HttpClientOptions types `body` as
      // `unknown | ((ex) => unknown)`, and the union collapses to `unknown`,
      // so the callback form infers nothing on its own.
      body: (ex: Exchange<WithAuth>) => ({
        name: ex.body.title,
        description: describe(ex.body),
        position: 65535,
      }),
    }),
    only((r: HttpResult<{ item: PlankaCard }>) => r.body.item, "card"),
  )
  .transform((body) => toTicket(body.card, body.board));
