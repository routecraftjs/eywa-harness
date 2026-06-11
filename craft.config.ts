import { agents } from "@routecraft/ai";
import { defineConfig, type CraftConfig } from "@routecraft/routecraft";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env } from "./env.js";

const here = dirname(fileURLToPath(import.meta.url));

export const craftConfig: CraftConfig = defineConfig({
  agent: {
    // Personas live in `agents/<id>.md`: frontmatter for metadata, body as
    // the system prompt. AGENT_MODEL overrides the frontmatter model so the
    // demo can swap models from the environment.
    agents: await agents(join(here, "agents"), {
      aria: env.AGENT_MODEL ? { model: env.AGENT_MODEL } : {},
    }),
  },
  llm: {
    providers: {
      anthropic: { apiKey: env.ANTHROPIC_API_KEY },
    },
  },
  // Mail connection options live in lib/mail-config.ts and ride on each
  // adapter: the CraftConfig.mail accounts block is silently ignored on
  // 0.6.0-canary.20 (no config applier registered for "mail").
  mcp: {
    name: "craft-harness",
    version: "0.1.0",
    transport: "http",
    host: env.APP_HOST,
    port: env.MCP_PORT,
  },
});
