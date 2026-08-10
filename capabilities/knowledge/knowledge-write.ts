import { craft, direct, file } from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import {
  renderKnowledgeFile,
  resolveKnowledgePath,
} from "../../lib/knowledge.js";
import { AGENT_PROVENANCE } from "../../lib/provenance.js";
import { requires } from "../../lib/identity.js";
import { SCOPES } from "../../lib/scopes.js";

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Path of the markdown file, e.g. 'team.md'. Overwrites if it exists.",
    ),
  frontmatter: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      "YAML frontmatter as an object. Include `tags`, `title`, and any structured fields the agent should later filter on.",
    ),
  body: z
    .string()
    .min(1)
    .describe("Markdown body content (without the frontmatter delimiters)."),
});

const ResultSchema = z.object({ path: z.string(), ok: z.literal(true) });

/** Header carrying the requested path across the body's transformation. */
const PATH_HEADER = "knowledge.path";

/**
 * Create or overwrite a markdown file.
 *
 * `file()` writes whatever the body is, so the body has to become the
 * rendered markdown before the write and cannot also carry the path. That is
 * what headers are for: metadata that outlives a body transformation. The
 * alternative, `.tap()`, would keep the body but is fire-and-forget, and a
 * write capability that cannot report failure is worse than useless to an
 * agent deciding what to tell the person who asked.
 */
export default craft()
  .id("knowledge-write")
  .description(
    "Create or overwrite a markdown file in the knowledge base. Prefer knowledge-append when adding to an existing file.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .authorize(requires(SCOPES.KB_WRITE))
  .from(direct())
  .header(PATH_HEADER, (ex) => ex.body.path)
  .transform((body) =>
    renderKnowledgeFile(
      body.frontmatter,
      body.body,
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
      createDirs: true,
    }),
  )
  .transform((_body, ex) => ({
    path: String(ex.headers[PATH_HEADER]),
    ok: true as const,
  }));
