import { agents } from "@routecraft/ai";
import {
  apiKey,
  defineConfig,
  jwks,
  type CraftConfig,
} from "@routecraft/routecraft";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env } from "./env.js";
import { isAuthorizedWebhook } from "./lib/webhook-auth.js";

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
     * That is the whole security posture of the showcase in one line: reaching
     * an outside system has to go through a capability written here, where
     * the inputs are typed, the call is deterministic, and the blast radius
     * is visible in a diff. Handing the model a live MCP client instead would
     * make the model's judgement the control plane.
     *
     * This does not affect `chat-with-aria`: that is an MCP server this
     * showcase exposes, an entry point INTO the agent, not a tool the agent
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
  /**
   * Inbound HTTP server for the Planka webhook.
   *
   * The webhook receiver is the only `http()` source in the showcase, so this
   * verifier guards exactly one endpoint. Everything else that touches Planka
   * uses `http()` as a client, which this does not affect.
   *
   * Verification happens here, at the edge, rather than as a step inside the
   * route: an unauthenticated request is answered 401 by the plugin and the
   * route never runs, so nothing downstream has to remember to check. See
   * `lib/webhook-auth.ts` for why this is a bearer token and not an HMAC
   * signature.
   */
  http: {
    host: env.APP_HOST,
    port: env.APP_PORT,
    auth: apiKey({
      in: "header",
      name: "authorization",
      verify: (presented) =>
        isAuthorizedWebhook(presented, env.PLANKA_WEBHOOK_SECRET)
          ? {
              kind: "custom",
              scheme: "webhook",
              subject: "planka",
              issuer: "craft-showcase",
            }
          : null,
    }),
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
    name: "craft-showcase",
    version: "0.1.0",
    transport: "http",
    host: env.APP_HOST,
    port: env.MCP_PORT,
    /**
     * Bearer tokens are verified against Dex's JWKS before any route runs, so
     * `chat-with-aria` receives a caller the framework has already
     * authenticated rather than a name someone typed.
     *
     * `AUTH_DISABLED` removes the verifier entirely instead of loosening it.
     * A verifier that sometimes accepts an unsigned token is a verifier
     * nobody can reason about; an absent one is at least honest, and the
     * route mints the weak demo identity in its place.
     */
    ...(env.AUTH_DISABLED
      ? {}
      : {
          auth: jwks({
            jwksUrl: env.OIDC_JWKS_URL,
            issuer: env.OIDC_ISSUER,
            audience: env.OIDC_AUDIENCE,
          }),
        }),
  },
});
