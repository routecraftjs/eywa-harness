/**
 * Authenticating the Planka webhook.
 *
 * Planka is the reason this file exists rather than a `signature:` option on
 * the source. Its webhook sender (`api/helpers/utils/send-webhooks.js`) can
 * attach exactly one credential, a static token in an `Authorization: Bearer`
 * header, and signs nothing. There is no HMAC to verify because Planka cannot
 * produce one.
 *
 * That is worth stating plainly rather than papering over. A shared bearer
 * token is weaker than a signature in two specific ways: it says nothing about
 * the body, so a man in the middle could rewrite the payload and keep the
 * header; and it is replayable, because there is no timestamp or nonce. On the
 * Compose network, where Planka reaches the app directly, neither is
 * reachable by an attacker who is not already inside. On a public ingress
 * both would matter.
 *
 * The alternative was a shim that HMACs Planka's payload on the way past. It
 * was rejected on purpose: the signature would attest only that our own
 * container computed it, which is authentication theatre, and this codebase
 * already argues in `lib/identity.ts` that a weak signal must not be dressed
 * up as a strong one. Verify what the sender can actually prove.
 *
 * Swap Planka for GitHub, Monday, or Stripe, all of which really do sign, and
 * the honest change is to delete this and put `signature:` back on the source.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Hashed first so both sides are always 32 bytes: `timingSafeEqual` throws on
 * a length mismatch, and guarding that with a length check would leak the
 * secret's length on every request.
 */
const constantTimeEquals = (a: string, b: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

/**
 * Whether an `Authorization` header value carries the expected webhook token.
 *
 * The `Bearer` prefix is optional because the caller decides it, not us:
 * Planka sends one, and a `curl` reproducing the request by hand often does
 * not. Both are accepted; anything else is not.
 *
 * An empty configured secret always fails. A blank `PLANKA_WEBHOOK_SECRET`
 * would otherwise admit every request that sent no credential at all, turning
 * a misconfiguration into an open endpoint.
 */
export const isAuthorizedWebhook = (
  headerValue: string | undefined,
  secret: string,
): boolean => {
  if (!secret) return false;
  if (!headerValue) return false;

  const match = /^Bearer\s+(.*)$/i.exec(headerValue.trim());
  const presented = (match?.[1] ?? headerValue).trim();
  if (!presented) return false;

  return constantTimeEquals(presented, secret);
};
