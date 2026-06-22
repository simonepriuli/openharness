import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInviteCode, generateInviteCode, normalizeInviteCode } from "./invite-code.js";
import { checkJoinRateLimit, resetJoinRateLimitForTests } from "./join-rate-limit.js";
import { isOrgAdmin, OrgDbError } from "./org-db.js";

describe("invite-code", () => {
  it("normalizes codes by stripping spaces and dashes", () => {
    assert.equal(normalizeInviteCode(" abcd-efgh "), "ABCDEFGH");
  });

  it("generates 8-character codes from the safe alphabet", () => {
    const code = generateInviteCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });

  it("formats codes for display", () => {
    assert.equal(formatInviteCode("ABCDEFGH"), "ABCD-EFGH");
  });
});

describe("join-rate-limit", () => {
  it("allows attempts up to the configured limit", () => {
    resetJoinRateLimitForTests();
    const key = "test-user:test-ip";
    for (let i = 0; i < 10; i += 1) {
      assert.equal(checkJoinRateLimit(key), true);
    }
    assert.equal(checkJoinRateLimit(key), false);
  });
});

describe("isOrgAdmin", () => {
  it("treats owner and admin as org managers", () => {
    assert.equal(isOrgAdmin("owner"), true);
    assert.equal(isOrgAdmin("admin"), true);
    assert.equal(isOrgAdmin("member"), false);
    assert.equal(isOrgAdmin("custom"), false);
  });
});

describe("OrgDbError", () => {
  it("exposes stable error codes", () => {
    const err = new OrgDbError("INVALID_CODE", "Invalid invite code");
    assert.equal(err.code, "INVALID_CODE");
    assert.equal(err.message, "Invalid invite code");
  });
});
