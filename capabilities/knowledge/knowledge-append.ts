import { craft, direct, file } from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import {
  renderAppendedSection,
  resolveKnowledgePath,
} from "../../lib/knowledge.js";
import { AGENT_PROVENANCE } from "../../lib/provenance.js";
import { requires } from "../../lib/identity.js";
import { SCOPES } from "../../lib/scopes.js";

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Path of the markdown file to append to. Created if missing."),
  section: z
    .string()
    .min(1)
    .describe(
      "Markdown to append. Use a heading or bullet so the addition is visible to humans browsing the file.",
    ),
});

const ResultSchema = z.object({ path: z.string(), ok: z.literal(true) });

const PATH_HEADER = "knowledge.path";

/**
 * Append a section to a knowledge file.
 *
 * This is a real append, not a read-modify-write: the adapter opens the file
 * in append mode and adds the bytes. Two facts learned in the same minute
 * therefore both survive, where rewriting the whole file would silently drop
 * one of them. The cost is that the file's frontmatter is not restamped, so
 * each entry carries its own inline attribution instead.
 */
export default craft()
  .id("knowledge-append")
  .description(
    "Append a section to an existing markdown file in the knowledge base. Use to record durable facts you learn during a conversation.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .authorize(requires(SCOPES.KB_WRITE))
  .from(direct())
  .header(PATH_HEADER, (ex) => ex.body.path)
  .transform((body) =>
    renderAppendedSection(
      body.section,
      AGENT_PROVENANCE,
      new Date().toISOString(),
    ),
  )
  .to(
    file({
      path: (ex) =>
        resolveKnowledgePath(
          env.KNOWLEDGE_DIR,
          String(ex.headers[PATH_HEADER]),
        ),
      append: true,
      createDirs: true,
    }),
  )
  .transform((_body, ex) => ({
    path: String(ex.headers[PATH_HEADER]),
    ok: true as const,
  }));
