/**
 * HMAC webhook signature verifier.
 *
 * Planka, Monday, GitHub, Stripe, and many others sign webhooks with HMAC.
 * The schemes vary slightly (header name, hash algorithm, encoding, prefix
 * format). This helper covers the common cases. Promote to a Routecraft
 * built-in once stable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureScheme =
  | "hmac-sha256-hex"
  | "hmac-sha1-hex"
  | "hmac-sha256-base64";

export interface VerifyOptions {
  body: string;
  signature: string | undefined;
  secret: string;
  scheme?: SignatureScheme;
  /**
   * Optional prefix the upstream prepends to the signature header
   * (e.g. "sha256=" for GitHub).
   */
  prefix?: string;
}

export function verifySignature(opts: VerifyOptions): boolean {
  const { body, signature, secret, scheme = "hmac-sha256-hex", prefix } = opts;
  if (!signature) return false;

  const provided = prefix && signature.startsWith(prefix)
    ? signature.slice(prefix.length)
    : signature;

  let expected: string;
  switch (scheme) {
    case "hmac-sha256-hex":
      expected = createHmac("sha256", secret).update(body).digest("hex");
      break;
    case "hmac-sha1-hex":
      expected = createHmac("sha1", secret).update(body).digest("hex");
      break;
    case "hmac-sha256-base64":
      expected = createHmac("sha256", secret).update(body).digest("base64");
      break;
  }

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
