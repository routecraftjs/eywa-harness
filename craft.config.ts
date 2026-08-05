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
