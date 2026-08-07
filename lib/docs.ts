/**
 * Pure helpers for reading a published `llms.txt` documentation index.
 *
 * No IO: fetching is the `http()` adapter's job inside a route. What lives
 * here is parsing and relevance, both of which are worth testing on their
 * own.
 *
 * `llms.txt` is a small convention for exposing documentation to language
 * models: a markdown file of `- [Title](url): description` entries whose
 * links point at raw markdown. Both routecraft.dev and devoptix.nl publish
 * one, which is why the harness needs no bundled docs and never answers
 * from a stale copy.
 */

/** The index's own one-line summary of the product (its `>` blockquote). */
export const parseSummary = (index: string): string => {
  const lines = index
    .split("\n")
    .filter((line) => line.trimStart().startsWith(">"))
    .map((line) => line.trimStart().slice(1).trim());
  return lines.join(" ").trim();
};

/** A parsed `llms.txt`: the product blurb plus every page it advertises. */
export interface DocsIndex {
  summary: string;
  entries: DocEntry[];
}

/** One documentation page, as advertised by an `llms.txt` index. */
export interface DocEntry {
  title: string;
  url: string;
  description: string;
}

const ENTRY = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*:?\s*(.*)$/;

/** Parse the `- [Title](url): description` entries out of an index. */
export const parseDocsIndex = (index: string): DocEntry[] => {
  const entries: DocEntry[] = [];
  for (const line of index.split("\n")) {
    const match = ENTRY.exec(line.trim());
    if (!match) continue;
    const [, title, url, description] = match;
    // Only real documents: an index may also link a homepage or a repo.
    if (!url?.endsWith(".md")) continue;
    entries.push({
      title: title ?? "",
      url,
      description: description ?? "",
    });
  }
  return entries;
};

/**
 * Crude stem, so singular and plural collapse to the same key:
 * "capability" and "capabilities" both become "capabiliti", "operations"
 * becomes "operation". Real stemming would be more accurate and would also
 * be a dependency a demo does not need; this covers the mismatch that a
 * whole-word search gets wrong most often.
 */
const stem = (word: string): string => {
  const base = word.replace(/ies$/, "i").replace(/s$/, "").replace(/y$/, "i");
  // Past tense too ("changed" -> "chang", which prefixes "change"), but only
  // when enough word survives to stay meaningful: stripping "ed" from "need"
  // or "speed" would match far too much.
  const past = base.replace(/ed$/, "");
  return past.length >= 4 ? past : base;
};

/** Does any word in the haystack stem to the same key as this term? */
const mentions = (haystack: string, term: string): boolean => {
  const wanted = stem(term);
  return haystack
    .split(/[^a-z0-9]+/)
    .some((word) => word.length > 0 && stem(word).includes(wanted));
};

/**
 * A changelog mentions every feature by name, so it matches almost any
 * question while answering almost none. Demote it unless the question is
 * actually about releases.
 */
const isChangelog = (title: string): boolean =>
  /changelog|release note/.test(title);
const asksAboutReleases = (wanted: readonly string[]): boolean =>
  wanted.some((t) => /change|release|version|new/.test(t));

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

/** Content words of a question, lowercased and de-noised. */
export const terms = (question: string): string[] => [
  ...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  ),
];

/**
 * Rank pages against a question by term overlap, title weighted above
 * description because a title is the page's own summary of itself.
 *
 * Deliberately simple: this picks which page to fetch, and the model does
 * the actual reading. Embedding search would be more precise and would also
 * mean a vector store, an embedding key, and a sync job, none of which a
 * 30-second demo should need.
 */
export const rankDocs = (
  entries: readonly DocEntry[],
  question: string,
  limit = 5,
): DocEntry[] => {
  const wanted = terms(question);
  if (wanted.length === 0) return [];
  return entries
    .map((entry) => {
      const title = entry.title.toLowerCase();
      const description = entry.description.toLowerCase();
      let score = 0;
      for (const term of wanted) {
        // A title is the page's own summary of itself, so a hit there is
        // worth far more than one in prose that merely mentions the word.
        if (mentions(title, term)) score += 5;
        if (mentions(description, term)) score += 1;
      }
      if (isChangelog(title) && !asksAboutReleases(wanted)) score -= 2;
      return { entry, score };
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => scored.entry);
};
