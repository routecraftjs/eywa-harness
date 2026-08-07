import { describe, expect, it } from "vitest";
import { parseDocsIndex, parseSummary, rankDocs, terms } from "./docs.js";

const INDEX = `# Routecraft

> Routecraft is a code-first TypeScript automation framework.

## Links

- Website: <https://routecraft.dev>
- GitHub: [routecraft](https://github.com/routecraftjs/routecraft)

## Getting Started

- [Installation](https://routecraft.dev/raw/docs/introduction/installation.md): System requirements, manual setup, and production builds.
- [Introduction](https://routecraft.dev/raw/docs/introduction.md): What Routecraft is and how it works.
- [Capabilities](https://routecraft.dev/raw/docs/introduction/capabilities.md): Define what your AI can do, and exactly how it does it.
`;

describe("docs index", () => {
  it("parses the markdown entries", () => {
    const entries = parseDocsIndex(INDEX);
    expect(entries.map((e) => e.title)).toEqual([
      "Installation",
      "Introduction",
      "Capabilities",
    ]);
    expect(entries[0]?.url).toBe(
      "https://routecraft.dev/raw/docs/introduction/installation.md",
    );
    expect(entries[1]?.description).toBe(
      "What Routecraft is and how it works.",
    );
  });

  // The Links section holds a repo and a homepage, which are not pages the
  // agent can read as markdown. Only .md entries are documents.
  it("ignores links that are not markdown documents", () => {
    const urls = parseDocsIndex(INDEX).map((e) => e.url);
    expect(urls.every((u) => u.endsWith(".md"))).toBe(true);
    expect(urls).not.toContain("https://github.com/routecraftjs/routecraft");
  });

  it("reads the index's own product summary", () => {
    expect(parseSummary(INDEX)).toBe(
      "Routecraft is a code-first TypeScript automation framework.",
    );
  });

  // Singular and plural must collapse, or "what is a capability" misses the
  // page called "Capabilities" entirely.
  it("matches singular against plural titles", () => {
    const entries = parseDocsIndex(INDEX);
    expect(rankDocs(entries, "what is a capability")?.[0]?.title).toBe(
      "Capabilities",
    );
  });

  it("drops question noise so scoring sees content words", () => {
    expect(terms("What is a capability?")).toEqual(["capability"]);
  });

  it("ranks the page a question is about first", () => {
    const entries = parseDocsIndex(INDEX);
    expect(rankDocs(entries, "how do I install it")?.[0]?.title).toBe(
      "Installation",
    );
    expect(rankDocs(entries, "what are capabilities")?.[0]?.title).toBe(
      "Capabilities",
    );
  });

  it("returns nothing when no page matches, rather than a bad guess", () => {
    expect(rankDocs(parseDocsIndex(INDEX), "payroll tax deadlines")).toEqual(
      [],
    );
    expect(rankDocs(parseDocsIndex(INDEX), "the a of")).toEqual([]);
  });
});
