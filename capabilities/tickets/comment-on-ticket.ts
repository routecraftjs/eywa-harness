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
import { authHeader } from "../../lib/planka.js";

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

type Input = z.infer<typeof InputSchema>;
type WithAuth = Input & { token: string };

interface PlankaComment {
  id: string;
  cardId: string;
  text: string;
  createdAt: string;
}

export default craft()
  .id("comment-on-ticket")
  .description(
    "Add a comment to an existing ticket. Use to record progress, ask the human a question, or summarise what you did.",
  )
  .input({ body: InputSchema })
  .output({ body: OutputSchema })
  .from(direct())
  // No board lookup: commenting addresses the card by id, so the ids this
  // route needs are already in the request.
  .enrich(
    direct<unknown, string>("planka-token"),
    only((token: string) => token, "token"),
  )
  .enrich(
    http<WithAuth, { item: PlankaComment }>({
      method: "POST",
      url: (ex) => `${env.PLANKA_BASE_URL}/api/cards/${ex.body.id}/comments`,
      headers: (ex) => authHeader(ex.body.token),
      body: (ex: Exchange<WithAuth>) => ({ text: ex.body.text }),
    }),
    only((r: HttpResult<{ item: PlankaComment }>) => r.body.item, "comment"),
  )
  .transform((body) => ({
    id: body.comment.id,
    ticketId: body.comment.cardId,
    text: body.comment.text,
    createdAt: body.comment.createdAt,
  }));
