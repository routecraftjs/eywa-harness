import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { findKnowledgeFiles } from "../../lib/clients/s3.js";

const InputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Free-text query. Matches against frontmatter and body. Omit to list all files.",
    ),
  tag: z
    .string()
    .optional()
    .describe("Filter to files whose frontmatter `tags` contains this value."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max results. Defaults to 20."),
});

const ResultSchema = z.object({
  results: z.array(
    z.object({
      path: z.string(),
      frontmatter: z.record(z.string(), z.unknown()),
      snippet: z.string(),
    }),
  ),
});

export default craft()
  .id("knowledge-find")
  .description(
    "Search the markdown knowledge base. Use this BEFORE answering company-specific questions to ground your reply.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  // Searching lists the bucket and reads every file, so an agent that probes
  // the same topic several times in one conversation would re-read the whole
  // knowledge base each turn. A short TTL keeps repeat lookups cheap while
  // still surfacing a write from a minute ago.
  .cache({ ttl: 60_000 })
  .transform(async (body) => ({ results: await findKnowledgeFiles(body) }));
