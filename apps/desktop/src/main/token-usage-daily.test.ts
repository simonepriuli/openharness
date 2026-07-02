import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDailyTokens,
  localDateKey,
  pruneDailyOlderThan,
} from "./token-usage-daily.js";

describe("localDateKey", () => {
  it("formats local calendar date as YYYY-MM-DD", () => {
    const key = localDateKey(new Date(2026, 6, 2, 15, 30));
    assert.equal(key, "2026-07-02");
  });
});

describe("addDailyTokens", () => {
  it("accumulates tokens for the same day", () => {
    const daily = addDailyTokens({}, "2026-07-02", 100);
    const next = addDailyTokens(daily, "2026-07-02", 50);
    assert.equal(next["2026-07-02"], 150);
  });

  it("ignores non-positive deltas", () => {
    const daily = addDailyTokens({ "2026-07-02": 10 }, "2026-07-02", 0);
    assert.equal(daily["2026-07-02"], 10);
  });
});

describe("pruneDailyOlderThan", () => {
  it("removes entries older than the retention window", () => {
    const daily = {
      "2024-01-01": 100,
      "2025-08-01": 200,
      "2026-07-01": 300,
    };
    const pruned = pruneDailyOlderThan(daily, 12, new Date(2026, 6, 2));
    assert.deepEqual(pruned, {
      "2025-08-01": 200,
      "2026-07-01": 300,
    });
  });
});
