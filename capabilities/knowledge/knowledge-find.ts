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
  // Deliberately not cached. Searching does re-read the bucket every call,
  // but this is the agent's own memory and it writes to it: a cached result
  // means she appends a fact and then cannot find it, or reports "nothing on
  // file" for something added moments ago. That was not hypothetical, a 60s
  // TTL here produced exactly that failure in testing. Correctness on a
  // mutable store beats saving three object reads.
  .transform(async (body) => ({ results: await findKnowledgeFiles(body) }));
