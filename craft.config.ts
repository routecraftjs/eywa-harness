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
    /**
     * The agent may call capabilities in this repository and nothing else.
     *
     * `mcp: false` denies the agent every tool from an external MCP server.
     * That is the whole security posture of the harness in one line: reaching
     * an outside system has to go through a capability written here, where
     * the inputs are typed, the call is deterministic, and the blast radius
     * is visible in a diff. Handing the model a live MCP client instead would
     * make the model's judgement the control plane.
     *
     * This does not affect `chat-with-aria`: that is an MCP server this
     * harness exposes, an entry point INTO the agent, not a tool the agent
     * calls out to.
     *
     * All three kinds are spelled out because the type demands it: an
     * omitted key would silently deny that whole kind.
     */
    toolPolicy: {
      fn: true,
      direct: true,
      mcp: false,
    },
  },
  llm: {
    providers: {
      anthropic: { apiKey: env.ANTHROPIC_API_KEY },
    },
  },
  // Inbound HTTP server for the Planka webhook. Per-route signature
  // verification lives on the route; no global auth strategy is configured
  // because the only ingress is a signed webhook.
  http: {
    host: env.APP_HOST,
    port: env.APP_PORT,
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
