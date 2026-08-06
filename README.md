<div align="center">

  <img src="https://raw.githubusercontent.com/routecraftjs/routecraft/main/routecraft.svg" alt="Routecraft" width="120" />

  <p><strong>Tools for agents. Or the agent harness itself.</strong></p>

</div>

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

## The scenarios

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

The webhook is HMAC-signed and verified by the `http()` source against the
raw request bytes, before the route runs. An unsigned or tampered request
is rejected with 401 and never reaches the agent.

### 3. Knowledge query (chat via MCP)

Connect Claude Desktop or Cursor to `http://localhost:3001/mcp`. Use the
`chat-with-aria` tool and ask: *"When is the next public holiday?"* Aria
calls `knowledge-find` against the seeded `holidays.md` and answers from it.

### 4. Knowledge writeback

Tell Aria: *"Anna joined the team this week as a frontend engineer."* She
calls `knowledge-append` to add the entry to `team.md`. Next session, ask
*"Who joined recently?"* and she'll answer from her own note. The entry is
stamped with who wrote it and when, so memory carries its own provenance.

### 5. Human in the loop, by moving a card

Ask Aria to email someone outside the current thread: *"Email
procurement@acme-supplies.test and accept their quote."* She will not send
it. She calls `request-approval`, which parks the draft on the board as a
card. Open it, read (or edit) the action block, and drag the card to the
**Approved** list. The webhook fires, a deterministic route sends exactly
what the card says, and comments back on the card.

The agent is not in the trust path: approval is a board state it has no
capability to set, so it cannot approve its own request. That is the whole
point of doing it this way rather than asking the model to be careful.

### 6. The backlog that writes itself

Ask for something no tool covers: *"How many vacation days do I have
left?"* Aria says plainly that she cannot, then files a `report-gap` card
carrying the original request, what she tried, and what would have solved
it. A real request that hit a real wall is a better backlog item than any
speculative roadmap entry, and the card is the spec.

### 7. Ask it about Routecraft itself

Before you configure a single backend, ask the agent *"What is Routecraft?"*
and it answers from the live documentation.

The harness ships **no copy of the docs**. `ask-docs` reads the `llms.txt`
index that routecraft.dev and devoptix.nl already publish, ranks the pages a
question is about, and fetches that page's markdown. An answer is therefore
never staler than the website, and a docs fix needs no harness release.

This is also the one place `.cache()` genuinely belongs: the docs are remote,
read-only, and change on a release cadence. Contrast the knowledge base,
which the agent writes to and so must never be cached.

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
|-- capabilities/              agent tools, one per file
|   |-- tickets/               kanban operations + report-gap
|   |-- email/                 send-email
|   |-- approvals/             request-approval (human-in-the-loop)
|   |-- knowledge/             markdown-on-S3 read+write
|   |-- planka/                internal: cached token + board resolution
|   `-- mcp/chat-with-aria.ts  MCP entrypoint
|-- routes/                    inbox, ticket webhook, digest, heartbeat
|-- lib/
|   |-- clients/s3.ts          S3 (MinIO) client
|   |-- planka.ts              pure request/response mapping, no IO
|   |-- approvals.ts           approval card encode/decode (+ tests)
|   `-- schemas/               shared Zod schemas
|-- knowledge/                 seed markdown files
|-- compose.yml                full stack (Greenmail + Planka + MinIO + app)
|-- Dockerfile                 app container
|-- craft.config.ts            Routecraft config: agent, mail, mcp
`-- index.ts                   routes + capabilities exports
```

## Talking to a vendor API without a client library

Every Planka call goes through the `http()` adapter inside a route. There is
no hand-written REST client, and that is the point: `lib/planka.ts` holds
only pure request and response mapping, while auth, retries, and composition
belong to the pipeline.

Two internal routes carry what every board call needs. `planka-token` logs in
and caches the bearer token with a step-scope `.cache()`, so one login serves
the whole harness. `planka-board` resolves project to board to lists through
chained `.enrich()` steps, each adding what it learned to the body.

Capabilities then compose: `report-gap` and `request-approval` do not know how
a card reaches the board, they simply `.to(direct("create-ticket"))`.

## Both execution modes, on purpose

An agent platform that can only run agents is a chatbot with extra steps.
Two scheduled routes make the point that the same framework carries
ordinary automation:

- **`weekly-digest`** is deterministic. It counts cards, lists recent
  knowledge changes, and emails a summary. No model is involved, because
  counting needs no judgement and an LLM here would be slower, costlier,
  and less predictable.
- **`heartbeat`** is agentic. Same `cron()` source, but it wakes Aria with
  a standing instruction and lets her decide whether anything needs a
  nudge. Presence is composition: a heartbeat is a cron route, not a
  feature toggle.

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
