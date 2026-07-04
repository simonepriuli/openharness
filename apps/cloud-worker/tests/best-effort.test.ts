import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { bestEffortAsync, bestEffortSync } from "../src/best-effort.js";

describe("bestEffort helpers", () => {
  it("logs async failures without throwing", async () => {
    const warn = mock.method(console, "warn", () => undefined);
    await bestEffortAsync("async-op", async () => {
      throw new Error("async failed");
    });
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /async-op failed/);
    warn.mock.restore();
  });

  it("completes async operations silently on success", async () => {
    let ran = false;
    await bestEffortAsync("async-op", async () => {
      ran = true;
    });
    assert.equal(ran, true);
  });

  it("logs sync failures without throwing", () => {
    const warn = mock.method(console, "warn", () => undefined);
    bestEffortSync("sync-op", () => {
      throw new Error("sync failed");
    });
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /sync-op failed/);
    warn.mock.restore();
  });

  it("completes sync operations silently on success", () => {
    let ran = false;
    bestEffortSync("sync-op", () => {
      ran = true;
    });
    assert.equal(ran, true);
  });
});
