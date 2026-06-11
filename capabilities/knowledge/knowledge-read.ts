import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { readKnowledgeFile } from "../../lib/clients/s3.js";

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Path of the markdown file in the knowledge bucket, e.g. 'team.md'."),
});

const ResultSchema = z.object({
  path: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  content: z.string(),
});

export default craft()
  .id("knowledge-read")
  .description("Read a single markdown file from the knowledge base.")
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from<z.infer<typeof InputSchema>>(direct())
  .transform(async (body) => {
    const file = await readKnowledgeFile(body.path);
    if (!file) {
      throw new Error(
        `Knowledge file not found: ${body.path}. Use knowledge-find to list available paths.`,
      );
    }
    return file;
  });
