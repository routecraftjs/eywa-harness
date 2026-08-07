import { describe, expect, it } from "vitest";
import {
  hasTag,
  matchesQuery,
  parseKnowledgeFile,
  renderAppendedSection,
  renderKnowledgeFile,
  resolveKnowledgePath,
  snippet,
} from "./knowledge.js";

const ROOT = "/srv/knowledge";
const AT = "2026-08-07T12:00:00.000Z";
const ARIA = { author: "aria" };

describe("path resolution", () => {
  it("resolves a plain name and a subdirectory inside the root", () => {
    expect(resolveKnowledgePath(ROOT, "team.md")).toBe(
      "/srv/knowledge/team.md",
    );
    expect(resolveKnowledgePath(ROOT, "hr/policies.md")).toBe(
      "/srv/knowledge/hr/policies.md",
    );
  });

  // The agent chooses this path and the store is a real filesystem now, so
  // this is the check standing between a knowledge tool and arbitrary reads.
  it("refuses to escape the knowledge root", () => {
    expect(() => resolveKnowledgePath(ROOT, "../secrets.md")).toThrow(/inside/);
    expect(() => resolveKnowledgePath(ROOT, "a/../../secrets.md")).toThrow(
      /inside/,
    );
    expect(() => resolveKnowledgePath(ROOT, "/etc/passwd.md")).toThrow(
      /inside/,
    );
  });

  // A sibling directory shares the root's prefix as a string but is not
  // inside it. Comparing on the separator boundary is what catches this.
  it("refuses a sibling directory that merely shares the prefix", () => {
    expect(() =>
      resolveKnowledgePath(ROOT, "../knowledge-backup/x.md"),
    ).toThrow(/inside/);
  });

  it("refuses anything that is not markdown", () => {
    expect(() => resolveKnowledgePath(ROOT, "team.txt")).toThrow(/markdown/);
    expect(() => resolveKnowledgePath(ROOT, "team")).toThrow(/markdown/);
  });
});

describe("rendering and parsing", () => {
  it("round-trips frontmatter and body", () => {
    const raw = renderKnowledgeFile(
      { title: "Team", tags: ["people"] },
      "Anna is a frontend engineer.",
      ARIA,
      AT,
    );
    const parsed = parseKnowledgeFile(raw);
    expect(parsed.frontmatter.title).toBe("Team");
    expect(parsed.content.trim()).toBe("Anna is a frontend engineer.");
  });

  it("stamps every write with who wrote it and when", () => {
    const parsed = parseKnowledgeFile(
      renderKnowledgeFile({}, "body", ARIA, AT),
    );
    expect(parsed.frontmatter.updated_by).toBe("aria");
    expect(String(parsed.frontmatter.updated_at)).toContain("2026-08-07");
  });

  it("reads a file that has no frontmatter at all", () => {
    const parsed = parseKnowledgeFile("Just a note.\n");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.content.trim()).toBe("Just a note.");
  });

  // Appends do not rewrite the file, so this inline comment is the only
  // record of who added the entry. It has to survive a read back.
  it("keeps per-entry attribution out of the rendered markdown", () => {
    const section = renderAppendedSection("- Anna joined", ARIA, AT);
    expect(section).toContain("- Anna joined");
    expect(section).toContain(`<!-- aria, ${AT} -->`);
    expect(section.startsWith("\n\n")).toBe(true);
  });

  it("records the channel when one is known", () => {
    expect(
      renderAppendedSection("note", { author: "aria", channel: "email" }, AT),
    ).toContain("aria via email");
  });
});

describe("matching", () => {
  const file = {
    frontmatter: { tags: ["HR", "Leave"] },
    content: "The office is closed on public holidays. See the calendar.",
  };

  it("matches tags without caring about case", () => {
    expect(hasTag(file.frontmatter, "hr")).toBe(true);
    expect(hasTag(file.frontmatter, "LEAVE")).toBe(true);
    expect(hasTag(file.frontmatter, "finance")).toBe(false);
  });

  it("treats a single string tag as a list of one", () => {
    expect(hasTag({ tags: "hr" }, "hr")).toBe(true);
  });

  it("survives a file with no tags", () => {
    expect(hasTag({}, "hr")).toBe(false);
  });

  // Agents ask in natural language. A whole-phrase match shipped first and
  // returned nothing for questions the file plainly answered.
  it("matches terms independently rather than as a phrase", () => {
    expect(matchesQuery(file, "public holiday calendar")).toBe(true);
    expect(matchesQuery(file, "holiday payroll")).toBe(false);
  });

  it("searches frontmatter as well as the body", () => {
    expect(matchesQuery(file, "leave")).toBe(true);
  });
});

describe("snippets", () => {
  const content = `${"x".repeat(400)} the answer is here ${"y".repeat(400)}`;

  it("centres the excerpt on the match", () => {
    expect(snippet(content, "the answer")).toContain("the answer is here");
  });

  it("falls back to the opening when nothing matched", () => {
    expect(snippet(content, "nowhere").startsWith("x")).toBe(true);
  });

  it("stays within the requested length", () => {
    expect(snippet(content, "the answer").length).toBeLessThanOrEqual(240);
  });
});
