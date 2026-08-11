import {
  craft,
  direct,
  http,
  only,
  type HttpResult,
} from "@routecraft/routecraft";
import { z } from "zod";
import { rankDocs, type DocEntry, type DocsIndex } from "../../lib/docs.js";

const InputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      "What the person wants to know, in their own words. e.g. 'what is Routecraft?' or 'how do I write a capability?'",
    ),
  source: z
    .enum(["routecraft", "devoptix"])
    .default("routecraft")
    .describe(
      "Which documentation to search. 'routecraft' for the framework, 'devoptix' for the company that builds it.",
    ),
});

const ResultSchema = z.object({
  summary: z
    .string()
    .describe(
      "The documentation's own one-line description of the product. Answers broad 'what is it' questions on its own.",
    ),
  answeredFrom: z
    .object({ title: z.string(), url: z.string() })
    .nullable()
    .describe("The page whose content is included, if one matched."),
  content: z.string().describe("Markdown of the matched page."),
  alsoAvailable: z
    .array(z.object({ title: z.string(), description: z.string() }))
    .describe("Other pages that matched, to refine a follow-up question."),
});

type Input = z.infer<typeof InputSchema>;
type WithIndex = Input & { docs: DocsIndex };
type WithMatches = WithIndex & { matches: DocEntry[] };

/**
 * Answer questions about Routecraft (and DevOptix) from the live docs.
 *
 * The showcase ships no copy of the documentation. It reads the published
 * `llms.txt` index, picks the pages a question is about, and fetches their
 * markdown, so an answer is never staler than the website and a docs fix
 * needs no showcase release.
 *
 * It also means the agent can do something useful the moment it starts,
 * before anyone has configured a single backend: ask it what Routecraft is
 * and it will tell you, from the source.
 */
export default craft()
  .id("ask-docs")
  .description(
    "Answer questions about Routecraft (the framework this showcase is built on) or DevOptix (the company behind it), using the live published documentation. Use this whenever someone asks what Routecraft is, how it works, or how to build something with it.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .enrich(
    direct<unknown, DocsIndex>("docs-index"),
    only((index: DocsIndex) => index, "docs"),
  )
  .transform((body: WithIndex): WithMatches => ({
    ...body,
    matches: rankDocs(body.docs.entries, body.question),
  }))
  .enrich(
    // Fetch only the best match. The model reads one page well; handing it
    // five is mostly context it pays for and does not use, and a follow-up
    // question can always ask for another from `alsoAvailable`.
    http<WithMatches, string>({
      url: (ex: { body: WithMatches }) => ex.body.matches[0]?.url ?? "",
      throwOnHttpError: false,
    }),
    only(
      (r: HttpResult<string>) => (r.status === 200 ? String(r.body) : ""),
      "page",
    ),
  )
  .transform((body) => ({
    summary: body.docs.summary,
    answeredFrom: body.matches[0]
      ? { title: body.matches[0].title, url: body.matches[0].url }
      : null,
    content: body.page,
    alsoAvailable: body.matches.slice(1).map((entry) => ({
      title: entry.title,
      description: entry.description,
    })),
  }));
