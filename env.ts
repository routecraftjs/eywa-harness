import { z } from "zod";

const EnvSchema = z.object({
  LOG_LEVEL: z.string().default("info"),

  // LLM
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  AGENT_MODEL: z.string().optional(),

  // Mail (Greenmail by default for the demo)
  MAIL_HOST: z.string().default("greenmail"),
  MAIL_IMAP_PORT: z.coerce.number().default(3143),
  MAIL_SMTP_PORT: z.coerce.number().default(3025),
  MAIL_USER: z.string().default("aria@harness.local"),
  MAIL_PASSWORD: z.string().default("aria"),
  MAIL_TLS: z.coerce.boolean().default(false),
  MAIL_POLL_INTERVAL_MS: z.coerce.number().default(5000),

  // Planka (mock ticket system)
  PLANKA_BASE_URL: z.string().default("http://planka:1337"),
  PLANKA_USER: z.string().default("demo@harness.local"),
  PLANKA_PASSWORD: z.string().default("demo"),
  PLANKA_PROJECT_NAME: z.string().default("Craft Harness"),
  PLANKA_BOARD_NAME: z.string().default("Tasks"),
  PLANKA_WEBHOOK_SECRET: z.string().default("dev-secret-change-me"),
  PLANKA_APPROVAL_LIST: z.string().default("Approved"),
  // Planka issues a bearer token from a login call; cache it rather than
  // re-authenticating on every board operation.
  PLANKA_TOKEN_TTL_MS: z.coerce.number().default(55 * 60 * 1000),
  // Project, board, and list ids never move during a demo run.
  PLANKA_BOARD_TTL_MS: z.coerce.number().default(10 * 60 * 1000),

  // Where the deterministic weekly digest is sent.
  DIGEST_RECIPIENT: z.string().default("demo@harness.local"),

  // S3 (MinIO by default)
  S3_ENDPOINT: z.string().default("http://minio:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_KNOWLEDGE_BUCKET: z.string().default("knowledge"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Public documentation sources. Both sites publish an `llms.txt` index
  // whose entries link to raw markdown, so the harness needs no bundled
  // copy of the docs and never serves a stale answer.
  DOCS_ROUTECRAFT_INDEX: z
    .string()
    .default("https://routecraft.dev/llms.txt"),
  DOCS_DEVOPTIX_INDEX: z.string().default("https://devoptix.nl/llms.txt"),
  DOCS_CACHE_TTL_MS: z.coerce.number().default(60 * 60 * 1000),

  // Identity (Dex by default). OIDC_ISSUER must match the `issuer` in
  // dex/config.yaml exactly: it is compared against the token's `iss`.
  OIDC_ISSUER: z.string().default("http://dex:5556/dex"),
  OIDC_JWKS_URL: z.string().default("http://dex:5556/dex/keys"),
  OIDC_AUDIENCE: z.string().default("craft-harness"),
  /**
   * Leave the MCP endpoint and capability scopes unenforced. Off by default
   * so `docker compose up` still works with no token, on for the identity
   * scenario. Never set this true anywhere reachable from a network.
   */
  AUTH_DISABLED: z.coerce.boolean().default(false),

  // HTTP (webhook receiver + MCP transport)
  APP_HOST: z.string().default("0.0.0.0"),
  APP_PORT: z.coerce.number().default(3000),
  MCP_PORT: z.coerce.number().default(3001),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
