/**
 * The harness's authorization vocabulary: `domain:verb`, split by blast
 * radius rather than by which capability happens to need it.
 *
 * Scopes are enforced by `.authorize()` on each capability route, so the
 * check is deterministic code holding a verified principal. The agent is
 * never asked whether it should be allowed to do something; by the time a
 * tool runs, the answer is already settled.
 */
export const SCOPES = {
  /** Read tickets: get one, or list the board. */
  TICKETS_READ: "tickets:read",
  /** Create, move, or comment on tickets. Includes filing capability gaps. */
  TICKETS_WRITE: "tickets:write",
  /** Read the markdown knowledge base. */
  KB_READ: "kb:read",
  /** Create, overwrite, or append knowledge files. */
  KB_WRITE: "kb:write",
  /**
   * Send email immediately, with no human in the loop. The most dangerous
   * scope in the harness: mail leaves the building the moment a tool runs.
   */
  MAIL_SEND: "mail:send",
  /**
   * Park an outbound email on the board for a human to approve. Safe by
   * construction, because approving it is a board action the holder of this
   * scope may not be able to perform.
   */
  MAIL_DRAFT: "mail:draft",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

const ALL: readonly Scope[] = Object.values(SCOPES);

/**
 * Who gets what.
 *
 * This table is the one thing here that would NOT live in the application in
 * a real deployment: role-to-scope assignment belongs in the identity
 * provider, so revoking authority is an IdP edit rather than a deploy. Eywa
 * does exactly that, reading permissions from the caller's WorkOS role.
 *
 * It sits here only because a zero-setup demo IdP cannot carry custom
 * claims: Dex's static password connector has no group or role field. The
 * enforcement path is identical either way, which is the part worth
 * learning; swap this function for a claim read and nothing downstream
 * changes.
 *
 * `demo` deliberately lacks `mail:send`. That is the interesting case: the
 * user can ask Aria to write to anyone, and the only route to an actual
 * send is a draft a human approves on the board.
 */
const SCOPES_BY_EMAIL: Record<string, readonly Scope[]> = {
  "admin@harness.local": ALL,
  "demo@harness.local": [
    SCOPES.TICKETS_READ,
    SCOPES.TICKETS_WRITE,
    SCOPES.KB_READ,
    SCOPES.KB_WRITE,
    SCOPES.MAIL_DRAFT,
  ],
};

/**
 * Derive scopes from a verified token payload.
 *
 * Unknown subjects get nothing rather than a default set: authority is
 * granted explicitly or not at all, so a new user is powerless until
 * someone says otherwise.
 */
export const scopesFromClaims = (
  payload: Record<string, unknown>,
): string[] => {
  const email = typeof payload["email"] === "string" ? payload["email"] : "";
  return [...(SCOPES_BY_EMAIL[email] ?? [])];
};
