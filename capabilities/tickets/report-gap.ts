import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";

const InputSchema = z.object({
  need: z
    .string()
    .min(1)
    .describe(
      "The capability you were missing, in one line. e.g. 'read the leave calendar'.",
    ),
  request: z
    .string()
    .min(1)
    .describe("What the person actually asked for, in their words."),
  blocked: z
    .string()
    .min(1)
    .describe("What you tried and why it was not enough."),
  suggestion: z
    .string()
    .optional()
    .describe("How you would build it, if you have a concrete idea."),
});

const ResultSchema = z.object({ ticketId: z.string(), url: z.string() });

/**
 * The backlog that writes itself.
 *
 * When a real request hits a capability the harness does not have, that gap
 * is worth more than any speculative roadmap item: the requester is real,
 * the need is real, and the card carries the context needed to build it.
 * Filing it is how the agent's own limits become the next sprint.
 */
export default craft()
  .id("report-gap")
  .description(
    "File a capability gap when you cannot fulfil a request because a tool is missing. Use this instead of only apologising: say you cannot do it, then record it here so it can be built.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .transform((body) => ({
    title: `Capability gap: ${body.need}`,
    body: [
      `**Missing capability:** ${body.need}`,
      "",
      `**Original request:** ${body.request}`,
      "",
      `**Why I could not answer:** ${body.blocked}`,
      ...(body.suggestion
        ? ["", `**Suggested approach:** ${body.suggestion}`]
        : []),
      "",
      "---",
      "Filed automatically by Aria on hitting this gap during a real request.",
    ].join("\n"),
    labels: ["capability-gap"],
  }))
  // Composed rather than duplicated: card creation, board resolution, and
  // auth all live in create-ticket, so this route only decides what to say.
  .to(direct<unknown, { id: string; url: string }>("create-ticket"))
  .transform((ticket) => ({ ticketId: ticket.id, url: ticket.url }));
