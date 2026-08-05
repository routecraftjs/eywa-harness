import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { writeKnowledgeFile } from "../../lib/clients/s3.js";
import { AGENT_NAME } from "../../lib/provenance.js";

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Path of the markdown file, e.g. 'team.md'. Overwrites if it exists."),
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

export default craft()
  .id("knowledge-write")
  .description(
    "Create or overwrite a markdown file in the knowledge base. Prefer knowledge-append when adding to an existing file.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .transform(async (body) => {
    await writeKnowledgeFile(body.path, body.frontmatter, body.body, {
      author: AGENT_NAME,
    });
    return { path: body.path, ok: true as const };
  });
