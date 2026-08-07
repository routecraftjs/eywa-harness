import {
  craft,
  direct,
  directory,
  only,
  otherwise,
  when,
  type DirectoryEntry,
} from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import type { ScanResult } from "./knowledge-scan.js";

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
  limit: z.number().int().min(1).max(50).default(20).describe("Max results."),
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

/** Both branches converge on this so the capability has one output type. */
type Found = z.infer<typeof ResultSchema>;

/**
 * Search the knowledge base.
 *
 * The shape is list, fan out, read, score, collect, and every step of it is a
 * framework operation: `directory()` lists, `.split()` fans out one exchange
 * per file, `file()` reads each one, `.aggregate()` brings them back. The only
 * code that belongs to this harness is the scoring, which lives in
 * `lib/knowledge.ts` and is unit-tested without touching a disk.
 *
 * Deliberately not cached. Searching does re-read every file on every call,
 * but this is the agent's own memory and she writes to it: a cached result
 * means she appends a fact and then cannot find it, or reports "nothing on
 * file" for something added moments ago. That was not hypothetical, a 60s TTL
 * here produced exactly that failure in testing. Correctness on a mutable
 * store beats saving three reads.
 */
export default craft()
  .id("knowledge-find")
  .description(
    "Search the markdown knowledge base. Use this BEFORE answering company-specific questions to ground your reply.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .from(direct())
  .enrich(
    directory({ path: env.KNOWLEDGE_DIR, recursive: true }),
    // Filter here rather than in the scan: a listing is cheap, and every entry
    // that survives this line is a file the scan is going to open.
    only(
      (entries: DirectoryEntry[]) => entries.filter((e) => e.ext === ".md"),
      "entries",
    ),
  )
  .choice(
    // An empty knowledge base is a normal state, not an error: someone points
    // KNOWLEDGE_DIR at their own folder before putting anything in it. It
    // earns a branch because splitting zero entries yields zero children, and
    // a route that emits nothing has no answer for the agent waiting on it.
    when(
      (ex) => ex.body.entries.length === 0,
      (b) => b.transform((): Found => ({ results: [] })),
    ),
    otherwise((b) =>
      b
        .to(direct<unknown, ScanResult>("knowledge-scan"))
        .transform((scan): Found => ({ results: scan.results })),
    ),
  );
