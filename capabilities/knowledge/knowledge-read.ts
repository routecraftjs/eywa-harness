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
  frontmatter: z.record(z.unknown()),
  content: z.string(),
});

export default craft()
  .id("knowledge-read")
  .description("Read a single markdown file from the knowledge base.")
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .process(async (ex) => {
    const file = await readKnowledgeFile(ex.body.path);
    if (!file) {
      throw new Error(
        `Knowledge file not found: ${ex.body.path}. Use knowledge-find to list available paths.`,
      );
    }
    ex.body = file;
    return ex;
  });
