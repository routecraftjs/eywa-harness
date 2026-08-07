import {
  craft,
  direct,
  file,
  only,
  type DirectoryEntry,
} from "@routecraft/routecraft";
import {
  hasTag,
  matchesQuery,
  parseKnowledgeFile,
  snippet,
} from "../../lib/knowledge.js";

/** What the caller hands over: the listing, plus the query to judge it by. */
export interface ScanRequest {
  query?: string;
  tag?: string;
  limit: number;
  entries: DirectoryEntry[];
}

export interface ScanResult {
  results: Array<{
    path: string;
    frontmatter: Record<string, unknown>;
    snippet: string;
  }>;
}

/** One file being considered, carrying the query it is being judged against. */
type Candidate = Omit<ScanRequest, "entries"> & { entry: DirectoryEntry };
type Loaded = Candidate & { raw: string };

/**
 * Read and score every listed file. Internal: reached only by knowledge-find.
 *
 * This is a route of its own rather than the tail of knowledge-find because
 * `.split()` is not available inside a `.choice()` branch, and knowledge-find
 * needs a branch to answer an empty knowledge base without fanning out. A
 * route boundary is the composition the DSL does offer, and the split then
 * sits where it is allowed to: at the top level of its own pipeline.
 */
export default craft()
  .id("knowledge-scan")
  .description("Internal: read and score a listing of knowledge files.")
  .from<ScanRequest>(direct())
  // Each child carries the query as well as its file, because a split child
  // is judged on its own and has no way back to the parent body.
  .split<Candidate>((ex) =>
    ex.body.entries.map((entry) => ({
      query: ex.body.query,
      tag: ex.body.tag,
      limit: ex.body.limit,
      entry,
    })),
  )
  .enrich(
    // The listing produced this path, so it is inside the knowledge root by
    // construction and needs no second containment check.
    file({ path: (ex) => (ex.body as Candidate).entry.path }),
    only((raw: string) => raw, "raw"),
  )
  .transform((body: Loaded) => {
    const parsed = parseKnowledgeFile(body.raw);
    const matched =
      (!body.tag || hasTag(parsed.frontmatter, body.tag)) &&
      (!body.query || matchesQuery(parsed, body.query));

    return {
      limit: body.limit,
      match: matched
        ? {
            path: body.entry.relativePath,
            frontmatter: parsed.frontmatter,
            snippet: snippet(parsed.content, body.query),
          }
        : null,
    };
  })
  .aggregate()
  .transform((rows): ScanResult => ({
    results: rows
      .flatMap((row) => (row.match ? [row.match] : []))
      .slice(0, rows[0]?.limit ?? 20),
  }));
