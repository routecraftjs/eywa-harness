import { describe, expect, it } from "vitest";
import { isAuthorizedWebhook } from "./webhook-auth.js";

const SECRET = "dev-secret-change-me";

describe("isAuthorizedWebhook", () => {
  it("accepts the header Planka actually sends", () => {
    expect(isAuthorizedWebhook(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("accepts a bare token, which is what a hand-written curl sends", () => {
    expect(isAuthorizedWebhook(SECRET, SECRET)).toBe(true);
  });

  it("is case-insensitive about the scheme, as RFC 7235 requires", () => {
    expect(isAuthorizedWebhook(`bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(isAuthorizedWebhook(`Bearer nope`, SECRET)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedWebhook(undefined, SECRET)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(isAuthorizedWebhook("", SECRET)).toBe(false);
    expect(isAuthorizedWebhook("   ", SECRET)).toBe(false);
  });

  it("rejects the scheme with no token after it", () => {
    expect(isAuthorizedWebhook("Bearer ", SECRET)).toBe(false);
  });

  /**
   * The failure mode that matters most. If a blank secret compared equal to a
   * blank credential, forgetting to set PLANKA_WEBHOOK_SECRET would open the
   * endpoint to anyone rather than closing it.
   */
  it("rejects everything when no secret is configured", () => {
    expect(isAuthorizedWebhook("Bearer anything", "")).toBe(false);
    expect(isAuthorizedWebhook("", "")).toBe(false);
    expect(isAuthorizedWebhook(undefined, "")).toBe(false);
  });

  it("does not accept a token that merely starts with the secret", () => {
    expect(isAuthorizedWebhook(`Bearer ${SECRET}extra`, SECRET)).toBe(false);
  });
});
