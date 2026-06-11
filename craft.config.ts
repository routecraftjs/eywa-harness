import "@routecraft/ai";
import { defineConfig, type CraftConfig } from "@routecraft/routecraft";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { env } from "./env.js";

/**
 * Load a persona system prompt from `agents/<id>.md`. The frontmatter
 * carries metadata; the body is the system prompt.
 */
function loadAgent(id: string) {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "agents", `${id}.md`), "utf8");
  const { data, content } = matter(raw);
  const tools = (data.tools as string | undefined)
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    name: (data.name as string) ?? id,
    description: data.description as string | undefined,
    model: (data.model as string) ?? env.AGENT_MODEL,
    maxTurns: (data.maxTurns as number | undefined) ?? 8,
    systemPrompt: content,
    tools,
  };
}

export const craftConfig: CraftConfig = defineConfig({
  agent: {
    agents: {
      aria: loadAgent("aria"),
    },
  },
  llm: {
    providers: {
      anthropic: { apiKey: env.ANTHROPIC_API_KEY },
    },
  },
  mail: {
    accounts: {
      default: {
        imap: {
          host: env.MAIL_HOST,
          port: env.MAIL_IMAP_PORT,
          secure: env.MAIL_TLS,
          auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
        },
        smtp: {
          host: env.MAIL_HOST,
          port: env.MAIL_SMTP_PORT,
          secure: env.MAIL_TLS,
          auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
          from: env.MAIL_USER,
        },
      },
    },
  },
  mcp: {
    name: "craft-harness",
    version: "0.1.0",
    transport: "http",
    host: env.APP_HOST,
    port: env.MCP_PORT,
  },
});
