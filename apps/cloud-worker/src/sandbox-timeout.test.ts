import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remainingMsUntilExpiry } from "./sandbox-timeout.js";

describe("remainingMsUntilExpiry", () => {
  it("returns remaining milliseconds from expiresAt", () => {
    const nowMs = Date.parse("2026-07-04T10:00:00.000Z");
    const expiresAt = new Date("2026-07-04T10:04:00.000Z");

    assert.equal(remainingMsUntilExpiry(expiresAt, nowMs), 4 * 60 * 1000);
  });

  it("returns undefined when expiresAt is missing or invalid", () => {
    assert.equal(remainingMsUntilExpiry(undefined), undefined);
    assert.equal(remainingMsUntilExpiry(new Date("invalid")), undefined);
  });
});
