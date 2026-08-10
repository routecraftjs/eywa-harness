import { craft, direct, file, only } from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import {
  parseKnowledgeFile,
  resolveKnowledgePath,
} from "../../lib/knowledge.js";
import { requires } from "../../lib/identity.js";
import { SCOPES } from "../../lib/scopes.js";

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Path of the markdown file in the knowledge base, e.g. 'team.md'.",
    ),
});

const ResultSchema = z.object({
  path: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  content: z.string(),
});

type Input = z.infer<typeof InputSchema>;

/**
 * Read one markdown file out of the knowledge base.
 *
 * The whole capability is a path check and a parse: `file()` does the read,
 * and a missing file surfaces as the adapter's own "file not found" error,
 * which is exactly what the agent should hear.
 */
export default craft()
  .id("knowledge-read")
  .description("Read a single markdown file from the knowledge base.")
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .authorize(requires(SCOPES.KB_READ))
  .from(direct())
  .enrich(
    file({
      path: (ex) =>
        resolveKnowledgePath(env.KNOWLEDGE_DIR, (ex.body as Input).path),
    }),
    only((raw: string) => raw, "raw"),
  )
  .transform((body) => ({
    path: body.path,
    ...parseKnowledgeFile(body.raw),
  }));
