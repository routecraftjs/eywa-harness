/**
 * Who is acting, and on whose authority.
 *
 * The scope vocabulary lives in `lib/scopes.ts`. This file is the other half:
 * how each of the harness's four entry channels turns what it can actually
 * verify into a principal, and what the agent is allowed to be handed.
 *
 * The rule that shapes all of it is that identification is not authorization.
 * A `From:` header names a sender; it does not say what an agent may do for
 * them. So only the MCP channel, which carries a verified OIDC token, hands
 * Aria a real person's authority. Everything else runs on an authority the
 * harness itself owns and has deliberately kept small.
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
  issuer: "craft-harness",
};

/**
 * What the mailbox itself may authorise.
 *
 * Inbound mail is unauthenticated in this demo: Greenmail accepts any sender,
 * and even a real inbox only tells you DKIM passed, never what the sender may
 * ask of an agent. So a mail-triggered run acts as the mailbox, not as the
 * person who wrote in, and the mailbox may read, file tickets, and draft.
 *
 * `mail:send` is absent on purpose. It is the one authority that puts
 * something outside the building, and the only route to it from this channel
 * is a draft a human approves by moving a card.
 */
const MAILBOX_SCOPES: readonly Scope[] = [
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
  issuer: "craft-harness",
  scopes: [...MAILBOX_SCOPES],
  claims: { received_from: sender },
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
  issuer: "craft-harness",
  scopes: [...AUTONOMOUS_SCOPES],
  claims: { job },
});

/**
 * The identity the approval executor acts as.
 *
 * This is the only place `mail:send` is minted, and it is minted after two
 * independent facts have been established: the webhook's HMAC verified, and
 * the card is sitting in the approved list. A human moved it there, and the
 * agent has no capability that can move a card into that list.
 */
export const approvedByBoard = (cardId: string): PrincipalClaims => ({
  kind: "custom",
  scheme: "board",
  subject: `board:${env.PLANKA_APPROVAL_LIST}`,
  subjectProfile: "service",
  issuer: "craft-harness",
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
 * `demo@harness.local`, the user who cannot send mail: the fallback is the
 * weaker identity, never the stronger one.
 */
export const ANONYMOUS_FALLBACK: PrincipalClaims = {
  kind: "custom",
  scheme: "none",
  subject: "demo@harness.local",
  email: "demo@harness.local",
  subjectProfile: "user",
  issuer: "craft-harness",
  scopes: scopesFromClaims({ email: "demo@harness.local" }),
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
