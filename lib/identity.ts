/**
 * Who is acting, and on whose authority.
 *
 * The scope vocabulary lives in `lib/scopes.ts`. This file is the other half:
 * how each of the showcase's four entry channels turns what it can actually
 * verify into a principal, and what the agent is allowed to be handed.
 *
 * The rule that shapes all of it is that identification is not authorization.
 * A `From:` header names a sender; it does not say what an agent may do for
 * them. So only the MCP channel, which carries a verified OIDC token, hands
 * Aria a real person's authority. Everything else runs on an authority the
 * showcase itself owns and has deliberately kept small.
 */

import type { AuthorizeOptions, PrincipalClaims } from "@routecraft/routecraft";
import { env } from "../env.js";
import { SCOPES, scopesFromClaims, type Scope } from "./scopes.js";

/**
 * Aria, as an actor.
 *
 * This identity never carries scopes. An actor's own scopes describe what it
 * may do standalone, and Aria may do nothing standalone: every capability she
 * reaches is exercised on somebody's behalf, and the authority comes from
 * that somebody. Her reachability is enforced by `authorize({ actor })` on
 * each route, not by what she happens to hold.
 */
export const ARIA: PrincipalClaims = {
  scheme: "internal",
  subject: "agent:aria",
  subjectProfile: "ai_agent",
  issuer: "craft-showcase",
};

/**
 * What a channel a person just used may authorise.
 *
 * Shared by the mailbox and the board deliberately, as one constant rather
 * than two identical lists, because the thing they have in common is the
 * thing that decides the answer: somebody did something on purpose and is
 * waiting to see what happens. That is what separates these channels from
 * cron, and it is what earns them `kb:write` and `mail:draft`.
 *
 * Neither identity is the person, though. Inbound mail is unauthenticated in
 * this demo, and even a real inbox only tells you DKIM passed, never what the
 * sender may ask of an agent; a board event tells you a card moved, not who
 * may act on it. So a triggered run acts as the channel, and the channel may
 * read, file tickets, write notes, and draft.
 *
 * `mail:send` is absent on purpose. It is the one authority that puts
 * something outside the building, and the only route to it from either
 * channel is a draft a human approves by moving a card.
 */
const TRIGGERED_SCOPES: readonly Scope[] = [
  SCOPES.TICKETS_READ,
  SCOPES.TICKETS_WRITE,
  SCOPES.KB_READ,
  SCOPES.KB_WRITE,
  SCOPES.MAIL_DRAFT,
];

/** What a scheduled run may do with nobody watching. Read, look, comment. */
const AUTONOMOUS_SCOPES: readonly Scope[] = [
  SCOPES.TICKETS_READ,
  SCOPES.TICKETS_WRITE,
  SCOPES.KB_READ,
];

/**
 * The identity a mail-triggered run acts as.
 *
 * The sender's address rides along as a claim for the audit trail, and is
 * pointedly not the subject: recording who wrote in is useful, treating it as
 * authority is the mistake this whole file exists to avoid.
 */
export const mailbox = (sender: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "mailbox",
  subject: `mailbox:${env.MAIL_USER}`,
  subjectProfile: "service",
  issuer: "craft-showcase",
  scopes: [...TRIGGERED_SCOPES],
  claims: { received_from: sender },
});

/**
 * The identity a board-triggered triage run acts as.
 *
 * Its own identity rather than `scheduled()`, which it used to borrow. That
 * was an inheritance from a name, not a decision: `scheduled()` is narrowed
 * because nobody is watching a cron job, and a board event is the opposite
 * case, a person who just created or moved a card and is waiting.
 *
 * Borrowing it also made the showcase quietly asymmetric. Mail-triggered Aria
 * could park an approval draft; board-triggered Aria could not, so "email the
 * supplier and accept" refused when typed into a card and worked when sent by
 * email, for no reason a user could see. If anything the board is the better
 * authenticated of the two: the webhook proved a shared secret and the card
 * came from a signed-in Planka user, where a `From:` header proves nothing.
 *
 * The route already assumed this. Its filter drops approval cards that are
 * not yet in the approved list precisely so that Aria is not woken by the
 * very draft she just filed, which is only reachable if she can file one.
 */
export const boardTriage = (cardId: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "board",
  subject: "board:triage",
  subjectProfile: "service",
  issuer: "craft-showcase",
  scopes: [...TRIGGERED_SCOPES],
  claims: { card: cardId },
});

/**
 * The identity a scheduled run acts as.
 *
 * Minted on cron only. Standing authority that an inbound message could
 * trigger is not standing authority, it is an open door.
 */
export const scheduled = (job: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "internal",
  subject: "agent:aria",
  subjectProfile: "ai_agent",
  issuer: "craft-showcase",
  scopes: [...AUTONOMOUS_SCOPES],
  claims: { job },
});

/**
 * The identity the weekly digest acts as.
 *
 * It carries `mail:send` where the heartbeat does not, because it genuinely
 * sends: a deterministic summary, to a fixed address from configuration, with
 * no model anywhere in the route. Minted on cron, so nothing inbound can
 * trigger it.
 *
 * Separate from `scheduled()` rather than widening it. Two jobs run on the
 * clock and only one of them mails anybody; giving both the stronger identity
 * to save a function would hand the heartbeat, which wakes an agent, an
 * authority it has no use for.
 */
export const digest = (): PrincipalClaims => ({
  kind: "custom",
  scheme: "internal",
  subject: "job:weekly-digest",
  subjectProfile: "service",
  issuer: "craft-showcase",
  scopes: [SCOPES.TICKETS_READ, SCOPES.KB_READ, SCOPES.MAIL_SEND],
  claims: { job: "weekly-digest" },
});

/**
 * The identity a verified board webhook acts as while it works out what the
 * event actually means.
 *
 * Read-only, and deliberately so. The approval branch cannot know whether a
 * human approved anything until it has re-read the card, and that read needs
 * authority of its own. The alternative is minting `approvedByBoard()` up
 * front and reading with it, which would hand out `mail:send` on the strength
 * of the webhook alone: precisely the property the approval flow exists to
 * prevent. So the read runs on this, and the stronger identity is minted only
 * once the card has been found sitting in the approved list.
 */
export const boardEvent = (cardId: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "board",
  subject: "board:webhook",
  subjectProfile: "service",
  issuer: "craft-showcase",
  scopes: [SCOPES.TICKETS_READ],
  claims: { card: cardId },
});

/**
 * The identity the approval executor acts as.
 *
 * The only place `mail:send` is minted anywhere the agent can reach, and it is
 * minted after two independent facts have been established: the webhook
 * authenticated, and the card is sitting in the approved list. A human moved it
 * there, and the agent has no capability that can move a card into that list.
 *
 * `digest()` above also carries `mail:send`, but nothing agentic runs on it:
 * a deterministic route, a fixed recipient from configuration, no model in the
 * path.
 */
export const approvedByBoard = (cardId: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "board",
  subject: `board:${env.PLANKA_APPROVAL_LIST}`,
  subjectProfile: "service",
  issuer: "craft-showcase",
  scopes: [SCOPES.MAIL_SEND, SCOPES.TICKETS_WRITE],
  claims: { card: cardId },
});

/**
 * The scope ceiling to delegate to Aria for a verified human caller.
 *
 * `delegate()` intersects this with what the subject actually holds, so this
 * can only narrow. Today it narrows nothing, which is honest: the demo has no
 * consent record, and pretending otherwise by hard-coding a smaller set would
 * teach a shape the code does not really have.
 */
export const ceilingFor = (claims: Record<string, unknown>): string[] =>
  scopesFromClaims(claims);

/**
 * The caller a token-free run is treated as when `AUTH_DISABLED` is set.
 *
 * The quick start has to work before anyone has met Dex, so the MCP channel
 * falls back to the demo user's authority rather than refusing. Deliberately
 * `demo@showcase.local`, the user who cannot send mail: the fallback is the
 * weaker identity, never the stronger one.
 */
export const ANONYMOUS_FALLBACK: PrincipalClaims = {
  kind: "custom",
  scheme: "none",
  subject: "demo@showcase.local",
  email: "demo@showcase.local",
  subjectProfile: "user",
  issuer: "craft-showcase",
  scopes: scopesFromClaims({ email: "demo@showcase.local" }),
};

/** Whether identity is being enforced at the edge. */
export const authEnforced = !env.AUTH_DISABLED;

/**
 * The authorization every agent-facing capability declares.
 *
 * Two conditions, and both matter. The subject must hold the scopes, which is
 * the authority question. And the action must be performed either by that
 * subject directly or by Aria on their behalf, which is the reachability
 * question: no other agent, and no unnamed delegate, can drive these routes
 * even holding a principal that satisfies the scopes.
 *
 * Written once here rather than spelled out per capability, so adding a
 * second agent later is a decision made in one place instead of twelve.
 */
export const requires = (...scopes: Scope[]): AuthorizeOptions => ({
  scopes,
  actor: ["none", { subject: ARIA.subject, issuer: ARIA.issuer }],
});
