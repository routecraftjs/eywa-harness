/**
 * What each channel may actually do.
 *
 * `lib/identity.ts` decides who a run acts as, and each capability declares
 * what it needs. Those two are written in different files and nothing checks
 * that they agree, so this does: for every channel identity, assert which
 * capabilities it reaches and which refuse it.
 *
 * The refusals matter more than the passes. A capability that silently stops
 * working is a bug someone reports; an authority that silently widens is one
 * nobody notices. The table in the README is the human version of this file,
 * and if they ever disagree, this one is right.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authenticate,
  craft,
  delegate,
  direct,
  HeadersKeys,
  type PrincipalClaims,
} from "@routecraft/routecraft";
import { testContext, type TestContext } from "@routecraft/testing";
import {
  ANONYMOUS_FALLBACK,
  ARIA,
  approvedByBoard,
  ceilingFor,
  digest,
  mailbox,
  requires,
  scheduled,
} from "./identity.js";
import { SCOPES } from "./scopes.js";

/**
 * One probe route per scope, guarded by the very helper the capabilities use.
 *
 * Stand-ins rather than the real capabilities on purpose: a real one would do
 * real IO on the passing cases, and what needs checking here is the pairing of
 * minted identity against declared requirement, not what the route does after
 * it is let through.
 */
const probes = Object.values(SCOPES).map((scope) =>
  // eslint-disable-next-line @routecraft/routecraft/require-named-route -- the id is a template literal, which the rule cannot read statically; it is non-empty by construction
  craft()
    .id(`probe-${scope.replace(":", "-")}`)
    .authorize(requires(scope))
    .from(direct())
    .transform(() => ({ allowed: true })),
);

let ctx: TestContext;

beforeAll(async () => {
  ctx = await testContext().routes(probes).build();
  await ctx.startAndWaitReady();
});
afterAll(async () => {
  await ctx?.stop();
});

/**
 * Does a channel's principal satisfy a capability's requirement?
 *
 * Built exactly the way the routes build it: mint the channel identity, then
 * delegate to Aria where the route delegates. Dispatched through the real
 * pipeline, so the answer is the one production would give.
 */
const canReach = async (
  claims: PrincipalClaims,
  scope: (typeof SCOPES)[keyof typeof SCOPES],
  { asDelegate = true } = {},
): Promise<boolean> => {
  const subject = authenticate(claims);
  const principal = asDelegate ? delegate(subject, ARIA) : subject;
  try {
    await ctx.client.sendDirect(
      `probe-${scope.replace(":", "-")}`,
      {},
      { [HeadersKeys.AUTH_PRINCIPAL]: principal },
    );
    return true;
  } catch {
    return false;
  }
};

describe("email acts as the mailbox", () => {
  const claims = mailbox("anyone@example.test");

  it("may read and write knowledge, and file tickets", async () => {
    expect(await canReach(claims, SCOPES.KB_READ)).toBe(true);
    expect(await canReach(claims, SCOPES.KB_WRITE)).toBe(true);
    expect(await canReach(claims, SCOPES.TICKETS_WRITE)).toBe(true);
  });

  it("may draft an email but never send one", async () => {
    expect(await canReach(claims, SCOPES.MAIL_DRAFT)).toBe(true);
    expect(await canReach(claims, SCOPES.MAIL_SEND)).toBe(false);
  });

  // The sender is recorded for audit and is pointedly not the subject.
  it("records who wrote in without treating it as authority", async () => {
    expect(claims.claims?.received_from).toBe("anyone@example.test");
    expect(claims.subject).not.toContain("anyone@example.test");
  });
});

describe("cron acts as the harness itself", () => {
  const claims = scheduled("heartbeat");

  it("may look at the board and the knowledge base", async () => {
    expect(await canReach(claims, SCOPES.TICKETS_READ)).toBe(true);
    expect(await canReach(claims, SCOPES.TICKETS_WRITE)).toBe(true);
    expect(await canReach(claims, SCOPES.KB_READ)).toBe(true);
  });

  // A scheduled run has nobody watching it. It does not get to write to
  // memory unprompted, and it certainly does not get to mail anyone.
  it("may not write knowledge, draft, or send", async () => {
    expect(await canReach(claims, SCOPES.KB_WRITE)).toBe(false);
    expect(await canReach(claims, SCOPES.MAIL_DRAFT)).toBe(false);
    expect(await canReach(claims, SCOPES.MAIL_SEND)).toBe(false);
  });
});

describe("the weekly digest sends on its own authority", () => {
  const claims = digest();

  // Deterministic route, fixed recipient from config, no model in the path.
  // It reaches send-email directly rather than as anyone's delegate.
  it("may send, and may read what it summarises", async () => {
    expect(
      await canReach(claims, SCOPES.MAIL_SEND, { asDelegate: false }),
    ).toBe(true);
    expect(
      await canReach(claims, SCOPES.TICKETS_READ, { asDelegate: false }),
    ).toBe(true);
    expect(await canReach(claims, SCOPES.KB_READ, { asDelegate: false })).toBe(
      true,
    );
  });

  // The reason this is its own identity and not a wider `scheduled()`.
  it("may not write anything", async () => {
    expect(await canReach(claims, SCOPES.KB_WRITE, { asDelegate: false })).toBe(
      false,
    );
    expect(
      await canReach(claims, SCOPES.TICKETS_WRITE, { asDelegate: false }),
    ).toBe(false);
  });

  it("is a different identity from the heartbeat, which cannot mail", async () => {
    expect(
      await canReach(scheduled("heartbeat"), SCOPES.MAIL_SEND, {
        asDelegate: false,
      }),
    ).toBe(false);
  });
});

describe("the approval branch is the only agent-adjacent source of mail:send", () => {
  const claims = approvedByBoard("card-42");

  // Reached only after the HMAC verified and a human moved the card. This
  // principal is minted by a deterministic route, not handed to the agent,
  // so it is checked without a delegate.
  it("may send, because a human already approved the exact text", async () => {
    expect(
      await canReach(claims, SCOPES.MAIL_SEND, { asDelegate: false }),
    ).toBe(true);
    expect(
      await canReach(claims, SCOPES.TICKETS_WRITE, { asDelegate: false }),
    ).toBe(true);
  });

  it("carries nothing else", async () => {
    expect(await canReach(claims, SCOPES.KB_WRITE, { asDelegate: false })).toBe(
      false,
    );
  });
});

describe("MCP callers differ from each other", () => {
  const human = (email: string) => ({
    kind: "custom" as const,
    scheme: "test",
    subject: email,
    email,
    scopes: ceilingFor({ email }),
  });

  it("gives admin@harness.local a real send", async () => {
    expect(await canReach(human("admin@harness.local"), SCOPES.MAIL_SEND)).toBe(
      true,
    );
  });

  // The whole demo turns on this one line: same prompt, same model, different
  // answer, and the difference is not the model's to make.
  it("gives demo@harness.local a draft instead", async () => {
    expect(await canReach(human("demo@harness.local"), SCOPES.MAIL_DRAFT)).toBe(
      true,
    );
    expect(await canReach(human("demo@harness.local"), SCOPES.MAIL_SEND)).toBe(
      false,
    );
  });

  it("gives an unknown caller nothing at all", async () => {
    const stranger = human("nobody@elsewhere.test");
    expect(stranger.scopes).toEqual([]);
    expect(await canReach(stranger, SCOPES.KB_READ)).toBe(false);
  });

  // The token-free fallback must be the weaker identity, never the stronger.
  it("falls back to the user who cannot send", async () => {
    expect(await canReach(ANONYMOUS_FALLBACK, SCOPES.KB_READ)).toBe(true);
    expect(await canReach(ANONYMOUS_FALLBACK, SCOPES.MAIL_SEND)).toBe(false);
  });
});

describe("reachability is checked as well as authority", () => {
  // Holding the scope is not enough. Another agent driving the same subject's
  // authority is refused, which is what `actor` in requires() buys.
  it("refuses an agent that is not Aria", async () => {
    const impostor = delegate(
      authenticate({
        kind: "custom",
        scheme: "test",
        subject: "admin@harness.local",
        scopes: [SCOPES.MAIL_SEND],
      }),
      {
        scheme: "internal",
        subject: "agent:someone-else",
        subjectProfile: "ai_agent",
        issuer: "craft-harness",
      },
    );
    await expect(
      ctx.client.sendDirect(
        "probe-mail-send",
        {},
        { [HeadersKeys.AUTH_PRINCIPAL]: impostor },
      ),
    ).rejects.toThrow();
  });

  it("still allows the person acting directly", async () => {
    expect(
      await canReach(
        {
          kind: "custom",
          scheme: "test",
          subject: "admin@harness.local",
          scopes: [SCOPES.MAIL_SEND],
        },
        SCOPES.MAIL_SEND,
        { asDelegate: false },
      ),
    ).toBe(true);
  });
});
