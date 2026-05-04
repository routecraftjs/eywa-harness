import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import { appendToKnowledgeFile } from "../../lib/clients/s3.js";

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

export default craft()
  .id("knowledge-append")
  .description(
    "Append a section to an existing markdown file in the knowledge base. Use to record durable facts you learn during a conversation.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .process(async (ex) => {
    await appendToKnowledgeFile(ex.body.path, ex.body.section);
    ex.body = { path: ex.body.path, ok: true };
    return ex;
  });
