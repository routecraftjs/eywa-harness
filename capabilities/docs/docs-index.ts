import { craft, direct, http, type HttpResult } from "@routecraft/routecraft";
import { z } from "zod";
import { env } from "../../env.js";
import {
  parseDocsIndex,
  parseSummary,
  type DocsIndex,
} from "../../lib/docs.js";

const InputSchema = z.object({
  source: z.enum(["routecraft", "devoptix"]),
});

const INDEX_URL: Record<string, string> = {
  routecraft: env.DOCS_ROUTECRAFT_INDEX,
  devoptix: env.DOCS_DEVOPTIX_INDEX,
};

/**
 * Fetch and cache a published `llms.txt` documentation index.
 *
 * Internal plumbing: no persona lists it, so only other routes reach it.
 *
 * This is what `.cache()` is genuinely for. The index is remote, read-only,
 * and changes on a release cadence rather than per request, so serving it
 * from memory for an hour is both cheaper and no less correct. Contrast the
 * knowledge base, which the agent writes to and therefore must never cache.
 */
export default craft()
  .id("docs-index")
  .description("Internal: fetch and cache a published llms.txt docs index.")
  .input({ body: InputSchema })
  .from(direct())
  .cache({
    ttl: env.DOCS_CACHE_TTL_MS,
    key: (ex) => `docs-index:${(ex.body as { source: string }).source}`,
  })
  .to(
    http<{ source: string }, string>({
      url: (ex) => INDEX_URL[ex.body.source] ?? env.DOCS_ROUTECRAFT_INDEX,
    }),
  )
  .transform((result: HttpResult<string>): DocsIndex => {
    const raw = String(result.body);
    return { summary: parseSummary(raw), entries: parseDocsIndex(raw) };
  });
