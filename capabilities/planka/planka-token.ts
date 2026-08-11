import { craft, direct, http } from "@routecraft/routecraft";
import { env } from "../../env.js";

/**
 * Planka access token, cached.
 *
 * Internal plumbing rather than an agent tool: it is not listed in any
 * persona's tool set, so only other routes reach it via `direct()`.
 *
 * The cache is the point. Planka issues a bearer token from a login call,
 * and re-authenticating on every board operation would triple the request
 * count for no benefit. `.cache()` wraps the login step with a fixed key,
 * so the whole showcase shares one token until it ages out. This is the
 * shape `.cache()` is actually for: an expensive call whose answer is
 * stable and does not change underneath you.
 */
export default craft()
  .id("planka-token")
  .description("Internal: fetch and cache a Planka API access token.")
  .from(direct())
  // Step scope: this wraps the login call itself, whose result does not
  // depend on the caller's body, so one token is shared until it ages out.
  .cache({ ttl: env.PLANKA_TOKEN_TTL_MS, key: () => "planka-token" })
  .to(
    http<unknown, { item: string }>({
      method: "POST",
      url: `${env.PLANKA_BASE_URL}/api/access-tokens`,
      body: {
        emailOrUsername: env.PLANKA_USER,
        password: env.PLANKA_PASSWORD,
      },
    }),
  )
  .transform((result) => result.body.item);
