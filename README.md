<div align="center">

  <img src="https://raw.githubusercontent.com/routecraftjs/routecraft/main/routecraft.svg" alt="Routecraft" width="120" />

  <p><strong>Tools for agents. Or the agent harness itself.</strong></p>

</div>

# Craft Showcase

Routecraft with everything turned on. One agent reachable over email, a kanban
board, and MCP; a markdown knowledge base she reads and writes; scope-checked
capabilities; and a human approval step that is a board state rather than a
prompt. Built on [Routecraft](https://routecraft.dev).

`docker compose up -d` for the backing services, `bun run dev` for the agent.
Then send her an email, create a kanban card, or talk to her over MCP. No real
Gmail, Monday, or GitHub credentials required.

## Start smaller than this

This is the far end, not the front door. Routecraft ships the agent harness
itself, so none of the infrastructure below is what you need to run an agent:

```bash
bun create routecraft
```

That gives you a capability and an agent with no Docker, no mail server, and no
identity provider. Or open the
[playground](https://codespaces.new/routecraftjs/craft-playground) and skip the
install entirely.

Come back here when you want the same primitives fully assembled.

## Why this exists

This repository is where Routecraft's claims get exercised at full size: the
best-practice reference, the source of the samples the blog posts quote, and
the smoke test a release has to survive. It demonstrates:

- A typed Routecraft pipeline with three input channels (email, kanban
  webhook, MCP) feeding a single AI agent.
- Read+write knowledge memory over a directory of markdown files. Drop your
  own context in, the agent uses it, and what she learns lands back in your
  working copy as a diff you can read.
- Mock backends only. Greenmail mocks Gmail, Planka mocks Monday. Swap them
  for real services and the same code runs.

## Quick start

You need Docker, [Bun](https://bun.sh), and an Anthropic API key.

Compose runs the backing services. The showcase itself runs on your machine,
because it is the part you are here to read and change.

```bash
git clone https://github.com/routecraftjs/craft-showcase.git
cd craft-showcase

cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

docker compose up -d     # mail, board, identity, webmail, board seed
bun install
bun run dev              # the agent
```

`docker compose up -d` finishes in a few seconds and seeds the board on the
way. `bun run dev` is ready once it logs `Starting Routecraft context`. Leave
it running; restart it whenever you change code.

Then open:

| What               | Where                                                        | Notes                                                      |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **Webmail**        | <http://localhost:8000>                                      | log in as `jaco@showcase.local`, **any password**          |
| **Kanban board**   | <http://localhost:1337>                                      | `demo@showcase.local` / `demo`                             |
| **MCP endpoint**   | `http://localhost:3001/mcp`                                  | point Claude Desktop or Cursor here                        |
| **Knowledge base** | the `knowledge/` folder                                      | plain markdown in your working copy                        |
| **Dex (OIDC)**     | <http://localhost:5556/dex/.well-known/openid-configuration> | only needed if you turn auth on                            |
| **Greenmail API**  | <http://localhost:8080>                                      | an OpenAPI browser, not a mail client; handy for scripting |

The webmail is Roundcube pointed at Greenmail's IMAP and SMTP. Greenmail ships
no mail client of its own and runs with authentication disabled, so any
password logs you in as any of the seeded users (`jaco@`, `demo@`, `aria@`).

<details>
<summary>Running the showcase in Docker too</summary>

```bash
echo 'APP_WEBHOOK_URL=http://app:3000/webhooks/planka' >> .env
docker compose --profile app up -d --build
```

The `APP_WEBHOOK_URL` line matters: without it Planka keeps posting webhooks
to your host, where nothing is listening any more, and scenarios 2 and 5 go
quiet with no error anywhere.

Prefer the host for development. A rebuilt container gets a new IP, Planka
holds its HTTP connections open, and deliveries then go to the old address
until Planka is restarted. It logs nothing when that happens.

</details>

## Walk through it in five minutes

Do these in order. Each one takes a few seconds of agent thinking time.

**1. Mail her something ordinary.** At <http://localhost:8000>, logged in as
`jaco@showcase.local`, write to `aria@showcase.local`:

> Subject: The office wifi keeps dropping
> The wifi in the Amsterdam office has dropped three times today. Can you log
> this so someone picks it up?

Within about ten seconds a card appears in **Backlog** on
<http://localhost:1337>, written up in her words with the reporter recorded.

**2. Give the board something to think about.** On the board, add a card to
**Backlog** with a title and a description that asks something real:

> Laptop for new starter Anna
> Anna starts on Monday and has no laptop yet. Who arranges this and by when?

Planka posts a webhook, Aria reads the card, and a comment appears on it. When
the knowledge base cannot answer, she says so and asks specific questions
rather than inventing a process.

**3. Ask her something she does know.** Point an MCP client at
`http://localhost:3001/mcp` and use the `chat-with-aria` tool:

> When is the next public holiday?

She answers from `knowledge/holidays.md` via `knowledge-find`.

**4. Teach her something.** In the same chat:

> Anna joined the team this week as a frontend engineer.

She appends it to `knowledge/team.md`. Open the file: the entry is stamped
with who wrote it and when. Ask "who joined recently?" in a fresh session and
she answers from her own note.

**5. Make her ask permission.** Mail her something that reaches outside the
company:

> Subject: Accept the quote from Acme Supplies
> Please email procurement@acme-supplies.test and tell them we accept their
> quote for the new office chairs.

She will not send it. A card named **Approve email: ...** appears in
**Backlog** containing the exact text she wants to send. Read it, edit it if
you like, then **drag the card to the Approved list**.

That drag is the send. The card gets a comment reading _"Approved and sent.
Recorded by the approval route, not by Aria."_, and the mail is really
delivered:

```bash
curl -s http://localhost:8080/api/user/procurement@acme-supplies.test/messages/INBOX | jq -r '.[].subject'
```

**6. Ask for something impossible.**

> How many vacation days do I have left?

She says plainly that she cannot, names what is missing, and offers to file a
capability gap. Say yes and a `report-gap` card appears carrying the original
request, what she tried, and what would have solved it.

### If nothing happens

- `bun run dev` must be running, and past `Starting Routecraft context`.
- Run it with `LOG_LEVEL=debug bun run dev` to see each step. At `info` a
  successful run is almost silent, so silence is not a failure signal.
- Comments live at `/api/cards/<id>/actions`, not on the card object, if you
  are checking the board over the API rather than in the browser.

## What each scenario is actually demonstrating

The walkthrough above is the how. This is the why, in the same order.

### 1. Email triage

Mail arriving for `aria@showcase.local` wakes a route that hands the message to
her. She decides what to do with it: file a ticket, write to the knowledge
base, or draft a reply.

She cannot mail you back directly, and that is deliberate. A mail-triggered
run acts as the mailbox, and the mailbox identity in `lib/identity.ts` has no
`mail:send` scope, because a `From:` header identifies a sender without saying
what an agent may do for them. Her only route outward is `request-approval`,
which parks the draft on the board for scenario 5.

### 2. Ticket triage

Open the Planka board at <http://localhost:1337>. Create a card under any
list. Planka fires a webhook to the showcase; Aria reads the card and
decides whether to comment, change its status, or wait for clarification.

The webhook is authenticated before the route runs. Planka presents
`PLANKA_WEBHOOK_SECRET` as a bearer token, the http plugin's verifier checks
it at the edge, and an unauthenticated request is rejected with 401 without
ever reaching the agent.

It is a token rather than an HMAC signature because Planka cannot sign: its
webhook sender attaches a static token and nothing else. `lib/webhook-auth.ts`
explains what that costs and why faking a signature in a shim would be worse.
Swap Planka for GitHub, Monday, or Stripe, which really do sign, and the
honest change is to put `signature:` back on the `http()` source.

### 3. Knowledge query (chat via MCP)

Connect Claude Desktop or Cursor to `http://localhost:3001/mcp`. Use the
`chat-with-aria` tool and ask: _"When is the next public holiday?"_ Aria
calls `knowledge-find` against the seeded `holidays.md` and answers from it.

### 4. Knowledge writeback

Tell Aria: _"Anna joined the team this week as a frontend engineer."_ She
calls `knowledge-append` to add the entry to `team.md`. Next session, ask
_"Who joined recently?"_ and she'll answer from her own note. The entry is
stamped with who wrote it and when, so memory carries its own provenance.

### 5. Human in the loop, by moving a card

Ask Aria to email someone outside the current thread: _"Email
procurement@acme-supplies.test and accept their quote."_ She will not send
it. She calls `request-approval`, which parks the draft on the board as a
card. Open it, read (or edit) the action block, and drag the card to the
**Approved** list. The webhook fires, a deterministic route sends exactly
what the card says, and comments back on the card.

The agent is not in the trust path: approval is a board state it has no
capability to set, so it cannot approve its own request. That is the whole
point of doing it this way rather than asking the model to be careful.

### 6. The backlog that writes itself

Ask for something no tool covers: _"How many vacation days do I have
left?"_ Aria says plainly that she cannot, names the tool she would need,
and offers to file a `report-gap` card carrying the original request, what
she tried, and what would have solved it. She asks before filing rather than
putting a card on your board uninvited. A real request that hit a real wall
is a better backlog item than any speculative roadmap entry, and the card is
the spec.

### 7. Ask it about Routecraft itself

Before you configure a single backend, ask the agent _"What is Routecraft?"_
and it answers from the live documentation.

The showcase ships **no copy of the docs**. `ask-docs` reads the `llms.txt`
index that routecraft.dev and devoptix.nl already publish, ranks the pages a
question is about, and fetches that page's markdown. An answer is therefore
never staler than the website, and a docs fix needs no showcase release.

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
            (Planka)                                  (markdown on disk)
```

Each input channel is a thin Routecraft route that hands the message to
Aria. She reasons over the input, calls tools, and replies through whichever
channel makes sense. Every tool she has is a route in this repository, and
`toolPolicy` in `craft.config.ts` denies her everything else: she cannot
reach an outside system except through a capability written here, where the
input is typed and the blast radius shows up in a diff.

## Project layout

```
craft-showcase/
|-- agents/aria.md             persona system prompt + tool list
|-- capabilities/              agent tools, one per file
|   |-- tickets/               kanban operations + report-gap
|   |-- email/                 send-email
|   |-- approvals/             request-approval (human-in-the-loop)
|   |-- knowledge/             markdown read+write over file()/directory()
|   |-- docs/                  live Routecraft docs over http()
|   |-- planka/                internal: cached token + board resolution
|   `-- mcp/chat-with-aria.ts  MCP entrypoint
|-- routes/                    inbox, ticket webhook, digest, heartbeat
|-- lib/
|   |-- planka.ts              pure request/response mapping, no IO
|   |-- knowledge.ts           path safety, frontmatter, scoring (+ tests)
|   |-- approvals.ts           approval card encode/decode (+ tests)
|   |-- scopes.ts              the authorization vocabulary
|   |-- identity.ts            who each channel acts as (+ tests)
|   |-- webhook-auth.ts        board webhook credential check (+ tests)
|   `-- schemas/               shared Zod schemas
|-- dex/config.yaml            the demo OIDC provider, declared in full
|-- knowledge/                 the knowledge base, seeded markdown
|-- compose.yml                backing services; the app is an opt-in profile
|-- Dockerfile                 app container, for that profile
|-- seed.ts                    creates the Planka project, board, and lists
|-- craft.config.ts            Routecraft config: agent, mail, mcp, http
`-- index.ts                   routes + capabilities exports
```

## Talking to a vendor API without a client library

Every Planka call goes through the `http()` adapter inside a route. There is
no hand-written REST client, and that is the point: `lib/planka.ts` holds
only pure request and response mapping, while auth, retries, and composition
belong to the pipeline.

Two internal routes carry what every board call needs. `planka-token` logs in
and caches the bearer token with a step-scope `.cache()`, so one login serves
the whole showcase. `planka-board` resolves project to board to lists through
chained `.enrich()` steps, each adding what it learned to the body.

Capabilities then compose: `report-gap` and `request-approval` do not know how
a card reaches the board, they simply `.to(direct("create-ticket"))`.

## Identity, and why the agent is not in the trust path

Every capability declares what authority it needs:

```ts
craft().id("send-email").authorize(requires(SCOPES.MAIL_SEND)).from(direct());
```

`requires()` asserts two things: the subject holds the scope, and the action
is performed either by that subject directly or by Aria on their behalf. No
other agent can drive these routes even holding a principal that satisfies the
scopes. The check is deterministic code reading a verified principal, and it
runs before the route body does. The model is never asked whether it should be
allowed to do something.

Each of the four channels turns what it can actually verify into a principal,
and they are deliberately not equal:

| Channel                        | Acts as                                              | Can send mail      |
| ------------------------------ | ---------------------------------------------------- | ------------------ |
| MCP chat                       | the caller in the bearer token, Aria acting for them | if that person can |
| Email                          | the mailbox, never the sender                        | no                 |
| Ticket webhook (triage)        | the board, never the card's author                   | no                 |
| Ticket webhook (approved card) | the board's approved list                            | yes                |
| Cron (heartbeat)               | the showcase itself                                  | no                 |
| Cron (weekly digest)           | the digest job                                       | to a fixed address |

The rule underneath is that identification is not authorization. A `From:`
header names who wrote in; it says nothing about what they may ask an agent to
do, and this demo's mail server will accept any address anyone types. So a
mail-triggered run acts as the mailbox, and the mailbox cannot send. The only
place `mail:send` reaches anything the agent touches is the approval branch,
and only after two independent facts hold: the webhook authenticated, and the
card was re-read and found in the approved list. A human put it there. Aria has
no capability that can.

The weekly digest also sends, and it is the exception that proves the rule: no
model sits in its path, the recipient comes from configuration, and it still
goes through the `send-email` capability rather than reaching for the mail
adapter directly. Every outbound mail in the showcase passes the same check.

`lib/identity.test.ts` asserts this whole table, refusals included. If the
table and the code ever disagree, the test is the one that is right.

Turn it on with one flag. `AUTH_DISABLED` defaults to true so the quick start
works before you have met Dex; set it to `false` in `.env` and the MCP endpoint
demands a real token:

```bash
TOKEN=$(curl -s http://localhost:5556/dex/token \
  -d grant_type=password -d client_id=craft-showcase \
  -d username=demo@showcase.local -d password=demo \
  -d scope=openid+email | jq -r .id_token)

curl http://localhost:3001/mcp -H "Authorization: Bearer $TOKEN" ...
```

Dex is a real OIDC provider, so Routecraft genuinely fetches a JWKS and
verifies signatures; without a token you get a 401 and an RFC 9728
`WWW-Authenticate` pointing at the issuer. Note what the flag does and does not
do: it decides whether the MCP edge insists callers prove who they are. Scopes
are enforced on capabilities either way, because every channel mints a
principal.

Ask `demo@showcase.local` to email someone and you get a draft on the board.
Ask `admin@showcase.local` and it sends. Same prompt, same model, different
answer, and the difference is not the model's to make.

One honest limitation: role-to-scope assignment lives in `lib/scopes.ts`, which
is the one thing here that would not live in the application in a real
deployment. Revoking authority should be an IdP edit, not a deploy. It sits in
code only because a zero-setup demo IdP cannot carry custom claims. The
enforcement path is identical either way, which is the part worth learning.

## Memory that is a folder, not a service

The knowledge base is a directory of markdown files, and no code in this
repository opens one. `directory()` lists the folder, `.split()` fans out one
exchange per file, `file()` reads each one, `.aggregate()` brings the results
back. What is left in `lib/knowledge.ts` is the part that is genuinely ours:
where a path may point, how frontmatter is rendered, and how a query scores.
All of it unit-tested without touching a disk.

Two decisions in there are worth the sentence:

- **Paths are resolved, then checked for containment.** The agent chooses the
  path, and the store is a real filesystem, so `../../etc/passwd` has to be
  rejected here or not at all. Inspecting the string misses encodings and
  absolute paths; `path.resolve` normalises all of it before the comparison.
- **Appends are real appends.** `file({ append: true })` adds the bytes rather
  than rewriting the file, so two facts learned in the same minute both
  survive. The cost is that the frontmatter is not restamped, which is why
  each entry carries its own inline attribution.

Because it is a bind mount, what the agent writes appears in your working copy
as a diff, and what you drop in she reads on her next call.

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

All config flows through `env.ts` (Zod-validated). Every default there points
at `localhost`, matching the ports Compose publishes, so running the showcase
with `bun run dev` needs nothing in `.env` but `ANTHROPIC_API_KEY`. The `app`
profile in `compose.yml` overrides the same variables with container
hostnames.

To run against real backends instead of mocks, swap the env vars:

| Variable                      | Mock value              | Real value                               |
| ----------------------------- | ----------------------- | ---------------------------------------- |
| `MAIL_HOST`                   | `localhost`             | `imap.gmail.com`                         |
| `MAIL_USER` / `MAIL_PASSWORD` | demo creds              | Gmail user + app password                |
| `MAIL_TLS`                    | `false`                 | `true`                                   |
| `PLANKA_BASE_URL`             | `http://localhost:1337` | swap for a Monday adapter (planned)      |
| `KNOWLEDGE_DIR`               | `./knowledge`           | any directory, including a synced folder |

## Routecraft framework gaps surfaced by this showcase

Building this is how the framework's gaps get found, and two are already
closed: the `directory()` adapter and its enricher role exist because this
showcase needed to list a folder mid-route, and webhook signature verification
moved into `http()` after the first version of the ticket route hand-rolled
it.

Still open:

- **`.split()` inside a `.choice()` branch.** `knowledge-find` needs a branch
  for the empty knowledge base and a fan-out for the non-empty one, and the
  branch builder has no `.split()`. Today that costs a route boundary
  (`knowledge-scan`), which is defensible composition but should not be
  compulsory.
- **`@routecraft/s3` adapter**, for deployments where knowledge belongs in a
  bucket rather than on a disk.
- **Markdown-with-frontmatter helper**. We use `gray-matter` directly today;
  Routecraft already parses frontmatter for personas internally and could
  expose that as a public util.

## What's not here (deliberately)

- Self-improvement loop. The agent does not propose new capabilities or
  rewrite the showcase's code. That belongs to a separate community example.
- Built-in chat UI. The MCP endpoint is the chat surface; bring your own
  client. A v1.1 release may add Lobe Chat as an optional fourth container.
- Per-correlation memory or event introspection. The agent treats each
  invocation as fresh. Memory is a v1.x topic.
- The OAuth authorization-code flow. The MCP server verifies real bearer
  tokens against a real JWKS, but Dex is configured for the password grant so
  the quick start needs no browser redirect. The production template swaps in
  a hosted IdP and Routecraft's `oauth()` proxy mode.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Links

- [Routecraft](https://routecraft.dev) - the framework powering this demo.
- [Playground](https://codespaces.new/routecraftjs/craft-playground) - the baseline template, hosted.
- [Greenmail](https://greenmail-mail-test.github.io/greenmail/) - local mail server.
- [Planka](https://planka.app/) - open-source Trello clone.
