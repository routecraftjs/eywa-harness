import { describe, expect, it } from "vitest";
import {
  parseApprovalAction,
  renderApprovalCard,
  type ApprovalAction,
} from "./approvals.js";

const action: ApprovalAction = {
  action: "send-email",
  to: "procurement@acme-supplies.test",
  subject: "Re: your quote",
  body: "We accept the quote and will order this week.",
};

describe("approval cards", () => {
  it("survives a render and parse round trip", () => {
    expect(parseApprovalAction(renderApprovalCard(action, "supplier reply"))).toEqual(
      action,
    );
  });

  it("shows the human what they are approving", () => {
    const card = renderApprovalCard(action, "supplier reply");
    expect(card).toContain(action.to);
    expect(card).toContain(action.subject);
    expect(card).toContain(action.body);
    expect(card).toContain("supplier reply");
  });

  // A summary printed alongside the payload would let a human edit prose that
  // is not what gets sent. Each field must appear exactly once on the card.
  it.each([["recipient", action.to], ["subject", action.subject], ["body", action.body]])(
    "renders the %s exactly once, so editing it cannot diverge from what is sent",
    (_label, value) => {
      const card = renderApprovalCard(action, "supplier reply");
      expect(card.split(value)).toHaveLength(2);
    },
  );

  // The parser is the gate between "a card moved" and "an email left the
  // building", so everything that is not an intact, schema-valid payload has
  // to come back null.
  it.each([
    ["an ordinary card with no payload", "Fix the coffee machine on floor 2"],
    ["an empty description", ""],
    ["a null description", null],
    ["an undefined description", undefined],
    ["a fenced block that is not JSON", "```routecraft-action\nnot json\n```"],
    [
      "a payload with an unknown action",
      '```routecraft-action\n{"action":"transfer-funds","to":"a@b.co","subject":"x","body":"y"}\n```',
    ],
    [
      "a payload with a malformed recipient",
      '```routecraft-action\n{"action":"send-email","to":"not-an-email","subject":"x","body":"y"}\n```',
    ],
    [
      "a payload missing the subject",
      '```routecraft-action\n{"action":"send-email","to":"a@b.co","body":"y"}\n```',
    ],
    [
      "an empty body",
      '```routecraft-action\n{"action":"send-email","to":"a@b.co","subject":"x","body":""}\n```',
    ],
  ])("returns null for %s", (_label, description) => {
    expect(parseApprovalAction(description)).toBeNull();
  });

  it("sends what a human edited, not what was drafted", () => {
    const edited = renderApprovalCard(action, "supplier reply").replace(
      "will order this week",
      "will confirm once legal signs off",
    );
    expect(parseApprovalAction(edited)?.body).toContain("legal signs off");
    expect(parseApprovalAction(edited)?.body).not.toContain("will order this week");
  });
});
