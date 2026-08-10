/**
 * The knowledge capabilities against a real directory.
 *
 * `lib/knowledge.test.ts` covers the rules in isolation; this covers the
 * pipeline that carries them: a `directory()` listing fanned out with
 * `.split()`, each file read by `file()`, and the results brought back with
 * `.aggregate()`. Enough moving parts that the unit tests passing says very
 * little about whether a search actually returns anything.
 *
 * The knowledge directory is read from `env` at import time, so the fixture
 * has to exist and be exported before the routes are loaded. Hence a temp
 * directory here and dynamic imports below.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testContext, type TestContext } from "@routecraft/testing";
import {
  authenticate,
  delegate,
  HeadersKeys,
  type Principal,
} from "@routecraft/routecraft";
import { SCOPES } from "../../lib/scopes.js";

const KNOWLEDGE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "craft-knowledge-"),
);
const EMPTY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "craft-empty-"));

process.env.KNOWLEDGE_DIR = KNOWLEDGE_DIR;
process.env.ANTHROPIC_API_KEY ??= "not-used-by-these-routes";

fs.writeFileSync(
  path.join(KNOWLEDGE_DIR, "holidays.md"),
  "---\ntitle: Holidays\ntags:\n  - hr\n---\nThe office is closed on public holidays.\n",
);
fs.writeFileSync(
  path.join(KNOWLEDGE_DIR, "team.md"),
  "---\ntitle: Team\ntags:\n  - people\n---\nBart is a backend engineer.\n",
);
fs.writeFileSync(path.join(KNOWLEDGE_DIR, "notes.txt"), "not markdown");

/**
 * A caller with the given scopes, with Aria acting on their behalf.
 *
 * The capabilities declare `.authorize()`, so a bare `sendDirect` is refused,
 * and rightly: an anonymous call is exactly what the check exists to stop.
 * Building the principal the way the framework does keeps the test honest,
 * since a hand-written header object would not be trusted either.
 */
const asCaller = (...scopes: string[]): Record<string, Principal> => ({
  [HeadersKeys.AUTH_PRINCIPAL]: delegate(
    authenticate({
      kind: "custom",
      scheme: "test",
      subject: "demo@harness.local",
      subjectProfile: "user",
      scopes,
    }),
    { subject: "agent:aria", issuer: "craft-harness" },
  ),
});

const READER = asCaller(SCOPES.KB_READ);
const WRITER = asCaller(SCOPES.KB_READ, SCOPES.KB_WRITE);

interface FindResult {
  results: Array<{
    path: string;
    frontmatter: Record<string, unknown>;
    snippet: string;
  }>;
}

let ctx: TestContext;

async function contextFor(dir: string): Promise<TestContext> {
  process.env.KNOWLEDGE_DIR = dir;
  // Fresh module graph each time: `env` is parsed once per import, and these
  // two contexts deliberately look at different directories.
  vi.resetModules();
  const routes = await Promise.all([
    import("./knowledge-find.js"),
    import("./knowledge-scan.js"),
    import("./knowledge-read.js"),
    import("./knowledge-write.js"),
    import("./knowledge-append.js"),
  ]);
  const built = await testContext()
    .routes(routes.map((m) => m.default))
    .build();
  await built.startAndWaitReady();
  return built;
}

const find = (input: Record<string, unknown>) =>
  ctx.client.sendDirect("knowledge-find", input, READER) as Promise<FindResult>;

beforeAll(async () => {
  ctx = await contextFor(KNOWLEDGE_DIR);
});

afterAll(async () => {
  await ctx?.stop();
  fs.rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
  fs.rmSync(EMPTY_DIR, { recursive: true, force: true });
});

describe("knowledge-find", () => {
  it("lists every markdown file when given no query", async () => {
    const found = await find({ limit: 20 });
    expect(found.results.map((r) => r.path).sort()).toEqual([
      "holidays.md",
      "team.md",
    ]);
  });

  it("matches terms independently, the way people ask", async () => {
    const found = await find({ query: "public holiday", limit: 20 });
    expect(found.results.map((r) => r.path)).toEqual(["holidays.md"]);
  });

  it("filters by frontmatter tag", async () => {
    const found = await find({ tag: "people", limit: 20 });
    expect(found.results.map((r) => r.path)).toEqual(["team.md"]);
  });

  it("returns nothing, not an error, when nothing matches", async () => {
    expect((await find({ query: "payroll tax", limit: 20 })).results).toEqual(
      [],
    );
  });
});

describe("knowledge-read", () => {
  it("splits frontmatter from body", async () => {
    const file = (await ctx.client.sendDirect(
      "knowledge-read",
      { path: "team.md" },
      READER,
    )) as { path: string; frontmatter: { title: string }; content: string };
    expect(file.frontmatter.title).toBe("Team");
    expect(file.content).toContain("backend engineer");
  });

  // The agent chooses this path. This is the check standing between a
  // knowledge tool and the rest of the filesystem.
  it("refuses a path that escapes the knowledge base", async () => {
    await expect(
      ctx.client.sendDirect(
        "knowledge-read",
        { path: "../../etc/passwd.md" },
        READER,
      ),
    ).rejects.toThrow();
  });
});

describe("writing", () => {
  it("writes a file the very next search can find", async () => {
    await ctx.client.sendDirect(
      "knowledge-write",
      {
        path: "vendors.md",
        frontmatter: { title: "Vendors", tags: ["ops"] },
        body: "Acme Supplies is our stationery vendor.",
      },
      WRITER,
    );
    const found = await find({ query: "stationery vendor", limit: 20 });
    expect(found.results.map((r) => r.path)).toEqual(["vendors.md"]);
  });

  // The failure this guards against is specific and was observed: cache the
  // search and the agent records a fact, then reports it has nothing on file.
  it("appends a fact the very next search can find", async () => {
    await ctx.client.sendDirect(
      "knowledge-append",
      { path: "team.md", section: "- Anna joined as a frontend engineer." },
      WRITER,
    );
    const found = await find({ query: "Anna frontend", limit: 20 });
    expect(found.results.map((r) => r.path)).toEqual(["team.md"]);
  });

  it("keeps per-entry attribution in the appended file", () => {
    const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, "team.md"), "utf8");
    expect(raw).toContain("- Anna joined as a frontend engineer.");
    expect(raw).toMatch(/<!-- aria, .+ -->/);
  });
});

describe("an empty knowledge base", () => {
  it("answers with no results rather than failing", async () => {
    const empty = await contextFor(EMPTY_DIR);
    try {
      const found = (await empty.client.sendDirect(
        "knowledge-find",
        { limit: 20 },
        READER,
      )) as FindResult;
      expect(found.results).toEqual([]);
    } finally {
      await empty.stop();
    }
  });
});

describe("authorization", () => {
  it("refuses an anonymous call", async () => {
    await expect(
      ctx.client.sendDirect("knowledge-find", { limit: 20 }),
    ).rejects.toThrow();
  });

  // The interesting half: a caller who is authenticated and may read is
  // still not a caller who may write. Nothing about this is Aria's decision.
  it("refuses a reader who tries to write", async () => {
    await expect(
      ctx.client.sendDirect(
        "knowledge-write",
        { path: "sneaky.md", frontmatter: {}, body: "nope" },
        READER,
      ),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(KNOWLEDGE_DIR, "sneaky.md"))).toBe(false);
  });
});
