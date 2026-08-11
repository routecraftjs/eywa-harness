/**
 * Pure helpers for the markdown knowledge base.
 *
 * There is no IO in this file. Reading, listing, and writing belong to the
 * `file()` and `directory()` adapters inside the capability routes, so what
 * remains here is the part that is genuinely ours: where a path is allowed to
 * point, how frontmatter is rendered and parsed, and how a query scores.
 *
 * That split is the point. A hand-written storage client would bury the
 * matching rules among stream handling and error mapping, and none of it
 * would be testable without a bucket.
 */

import * as path from "node:path";
import matter from "gray-matter";
import type { Provenance } from "./provenance.js";

/** A knowledge file after its frontmatter has been separated from its body. */
export interface KnowledgeFile {
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

/**
 * Resolve an agent-supplied path inside the knowledge directory.
 *
 * The agent chooses this path, and the store is now a real filesystem rather
 * than a bucket of opaque keys, so `../../etc/passwd` has to be rejected here
 * or not at all. Resolve first, then check containment: string inspection of
 * the input misses encodings, symlink-free `..` collapsing, and absolute
 * paths, while `path.resolve` normalises all three before the comparison.
 *
 * Restricting to `.md` is the same argument continued. Every capability in
 * this showcase reads and writes markdown, so anything else is either a typo
 * or an attempt to use the knowledge base as general file storage.
 */
export function resolveKnowledgePath(root: string, relative: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);

  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(
      `Knowledge path must stay inside the knowledge base: ${relative}`,
    );
  }
  if (!resolved.toLowerCase().endsWith(".md")) {
    throw new Error(`Knowledge files must be markdown (.md): ${relative}`);
  }
  return resolved;
}

/** Split raw markdown into frontmatter and body. */
export function parseKnowledgeFile(raw: string): Omit<KnowledgeFile, "path"> {
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    content: parsed.content,
  };
}

/** Render frontmatter and body back to markdown, stamped with provenance. */
export function renderKnowledgeFile(
  frontmatter: Record<string, unknown>,
  content: string,
  provenance: Provenance,
  at: string,
): string {
  return matter.stringify(content, {
    ...frontmatter,
    updated_at: at,
    updated_by: provenance.author,
    ...(provenance.channel ? { updated_via: provenance.channel } : {}),
  });
}

/**
 * Render one appended section with its own attribution.
 *
 * The attribution rides in an HTML comment: invisible when the markdown is
 * rendered, but present in the raw text the agent reads back. An append is a
 * genuine append (the file adapter opens in append mode and writes the
 * bytes), so the file's frontmatter is not rewritten and this inline stamp is
 * the only record of who added the entry. That is the right trade: read a
 * file, rewrite it whole, and two concurrent appends lose one of themselves.
 */
export function renderAppendedSection(
  section: string,
  provenance: Provenance,
  at: string,
): string {
  const via = provenance.channel ? ` via ${provenance.channel}` : "";
  return `\n\n${section.trim()}\n<!-- ${provenance.author}${via}, ${at} -->\n`;
}

const tagsOf = (frontmatter: Record<string, unknown>): string[] => {
  const tags = frontmatter["tags"];
  if (Array.isArray(tags)) return tags.map((t) => String(t).toLowerCase());
  if (typeof tags === "string") return [tags.toLowerCase()];
  return [];
};

export const hasTag = (
  frontmatter: Record<string, unknown>,
  tag: string,
): boolean => tagsOf(frontmatter).includes(tag.toLowerCase());

/**
 * Does this file answer the query?
 *
 * Every term must appear somewhere, but they are matched independently rather
 * than as a phrase. Agents ask in natural language ("public holiday
 * calendar") and those exact words almost never sit next to each other in the
 * file. A whole-phrase match shipped first and returned nothing for real
 * questions about documents that plainly held the answer.
 */
export function matchesQuery(
  file: Omit<KnowledgeFile, "path">,
  query: string,
): boolean {
  const haystack =
    `${JSON.stringify(file.frontmatter)} ${file.content}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** A short excerpt, centred on the query where one matched. */
export function snippet(content: string, query?: string, max = 240): string {
  const trimmed = content.replace(/\r/g, "").trim();
  if (!query) return trimmed.slice(0, max);

  const idx = trimmed.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return trimmed.slice(0, max);
  return trimmed.slice(Math.max(0, idx - 60), Math.max(0, idx - 60) + max);
}
