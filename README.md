# Craft Harness

A working AI agent in 30 seconds. Built on [Routecraft](https://routecraft.dev).

`docker compose up`, then send the agent an email, create a Kanban card, or
talk to her over MCP. No real Gmail, Monday, or GitHub credentials required.

## Why this exists

This is a flagship example for Routecraft. It demonstrates:

- A typed Routecraft pipeline with three input channels (email, kanban
  webhook, MCP) feeding a single AI agent.
- Read+write knowledge memory over an S3-compatible bucket of markdown
  files. Drop your own context in, the agent uses it.
- Mock backends only. Greenmail mocks Gmail, Planka mocks Monday, MinIO
  mocks S3. Swap them for real services and the same code runs.

## Quick start

You need Docker and an Anthropic API key.

```bash
git clone https://github.com/routecraftjs/craft-harness.git
cd craft-harness
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
docker compose up
```

Wait for everything to come up. Then visit:

- **Planka kanban**: <http://localhost:1337> (login `demo@harness.local` / `demo`)
- **Greenmail web UI**: <http://localhost:8025> (read what the agent sends)
- **MinIO console**: <http://localhost:9001> (login `minioadmin` / `minioadmin`)
- **MCP endpoint**: `http://localhost:3001/mcp` (point Claude Desktop or Cursor here)

## The four scenarios

### 1. Email triage

Send an email to `aria@harness.local` from any of the seeded users
(`demo@harness.local`, `jaco@harness.local`). The Greenmail web UI at
<http://localhost:8025> lets you compose mail directly. Aria reads it and
decides what to do: file a ticket, write to the knowledge base, or send a
reply.

### 2. Ticket triage

Open the Planka board at <http://localhost:1337>. Create a card under any
list. Planka fires a webhook to the harness; Aria reads the card and
decides whether to comment, change its status, or wait for clarification.

### 3. Knowledge query (chat via MCP)

Connect Claude Desktop or Cursor to `http://localhost:3001/mcp`. Use the
`chat-with-aria` tool and ask: *"When is the next public holiday?"* Aria
calls `knowledge-find` against the seeded `holidays.md` and answers from it.

### 4. Knowledge writeback

Tell Aria: *"Anna joined the team this week as a frontend engineer."* She
calls `knowledge-append` to add the entry to `team.md`. Next session, ask
*"Who joined recently?"* and she'll answer from her own note.

## Architecture

```
                                +-------------------------+
   inbound email --- IMAP ----> |                         |
   ticket events -- webhook --> |  process-inbox          |
   MCP chat   --- http   ----> |  process-ticket-event   |
                                |  chat-with-aria         |
                                |                         |
                                |     -> agent("aria")    |
                                |            |            |
                                +------------+------------+
                                             v
              +------------+-----------+-----------+--------------+
              v                        v                          v
       create-ticket            send-email              knowledge-find
       get-ticket               (Greenmail)             knowledge-read
       update-ticket-status                             knowledge-write
       comment-on-ticket                                knowledge-append
            (Planka)                                       (MinIO)
```

Each input channel is a thin Routecraft route that hands the message to
Aria. Aria has nine tools (the capabilities). She reasons over the input,
calls tools, and replies through whichever channel makes sense.

## Project layout

```
craft-harness/
|-- agents/aria.md             persona system prompt + tool list
|-- capabilities/              nine tools, one per file
|   |-- tickets/               Planka kanban operations
|   |-- email/                 send-email
|   |-- knowledge/             markdown-on-S3 read+write
|   `-- mcp/chat-with-aria.ts  MCP entrypoint
|-- routes/                    input adapters: inbox, ticket webhook
|-- lib/
|   |-- clients/               Planka REST + S3 (MinIO) clients
|   |-- webhook-signature.ts   HMAC verifier (reusable)
|   `-- schemas/               shared Zod schemas
|-- knowledge/                 seed markdown files
|-- compose.yml                full stack (Greenmail + Planka + MinIO + app)
|-- Dockerfile                 app container
|-- craft.config.ts            Routecraft config: agent, mail, mcp
`-- index.ts                   routes + capabilities exports
```

## Configuration

All config flows through `env.ts` (Zod-validated). The `compose.yml`
populates everything except `ANTHROPIC_API_KEY`, which you provide in
`.env`.

To run against real backends instead of mocks, swap the env vars:

| Variable | Mock value | Real value |
|---|---|---|
| `MAIL_HOST` | `greenmail` | `imap.gmail.com` |
| `MAIL_USER` / `MAIL_PASSWORD` | demo creds | Gmail user + app password |
| `MAIL_TLS` | `false` | `true` |
| `PLANKA_BASE_URL` | `http://planka:1337` | swap for a Monday adapter (planned) |
| `S3_ENDPOINT` | `http://minio:9000` | unset (uses AWS S3) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | minio creds | your AWS creds |

## Routecraft framework gaps surfaced by this harness

Building this revealed a few things Routecraft itself should ship out of
the box. Each one is implemented locally in this repo for now and will be
contributed back upstream:

- **`@routecraft/s3` adapter**. The `lib/clients/s3.ts` here is a candidate
  for promotion. Same code works against MinIO, AWS S3, R2, B2.
- **`@routecraft/postgres-events` event-store adapter**. Not in this v0;
  added in a v1.x release that demonstrates event-sourced agents.
- **`@routecraft/webhook-signature` helper**. The `lib/webhook-signature.ts`
  here covers HMAC-SHA256/SHA1/base64 with an optional prefix. Reusable
  across Planka, Monday, GitHub, Stripe.
- **HTTP ingress source**. `http()` is client/destination-only today, so
  the Planka webhook listener in `routes/process-ticket-event.ts` is a
  custom `Source` wrapping a Node HTTP server. A first-class webhook
  source belongs in the framework.
- **Custom headers on mail send**. `MailSendPayload` has no headers
  field, so replies cannot set `In-Reply-To`/`References` and threads
  do not stitch together in a real mail client.
- **Markdown-with-frontmatter helper**. We use `gray-matter` directly today;
  Routecraft already parses frontmatter for personas internally and could
  expose that as a public util.

## What's not here (deliberately)

- Self-improvement loop. The agent does not propose new capabilities or
  rewrite the harness's code. That belongs to a separate community example.
- Built-in chat UI. The MCP endpoint is the chat surface; bring your own
  client. A v1.1 release may add Lobe Chat as an optional fourth container.
- Per-correlation memory or event introspection. The agent treats each
  invocation as fresh. Memory is a v1.x topic.
- Real auth on the MCP server. Local-only demo; no OAuth. The production
  template adds Clerk-backed OAuth via Routecraft's `oauth()`.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Links

- [Routecraft](https://routecraft.dev) - the framework powering this demo.
- [Greenmail](https://greenmail-mail-test.github.io/greenmail/) - local mail server.
- [Planka](https://planka.app/) - open-source Trello clone.
- [MinIO](https://min.io/) - S3-compatible object store.
