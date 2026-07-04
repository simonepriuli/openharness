import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { Result } from "better-result";
import { waitForApiReachable } from "../src/api-health.js";
import { mockConfig } from "./helpers/fixtures.js";

describe("waitForApiReachable", () => {
  const originalFetch = globalThis.fetch;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("succeeds on 200 and warns on 401", async () => {
    globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;
    const ok = await waitForApiReachable(mockConfig(), { maxAttempts: 1 });
    assert.ok(Result.isOk(ok));

    const warn = mock.method(console, "warn", () => undefined);
    globalThis.fetch = mock.fn(async () => new Response("nope", { status: 401 })) as typeof fetch;
    const unauthorized = await waitForApiReachable(mockConfig(), { maxAttempts: 1 });
    assert.ok(Result.isOk(unauthorized));
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /401/);
    warn.mock.restore();
  });

  it("retries until failure", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      throw new Error("connection refused");
    }) as typeof fetch;

    const result = await waitForApiReachable(mockConfig(), { maxAttempts: 2, delayMs: 1 });
    assert.ok(Result.isError(result));
    assert.equal(calls, 2);
  });

  it("fails on unexpected status codes", async () => {
    globalThis.fetch = mock.fn(async () => new Response("bad", { status: 500 })) as typeof fetch;
    const result = await waitForApiReachable(mockConfig(), { maxAttempts: 1 });
    assert.ok(Result.isError(result));
    assert.match(result.error.message, /500/);
  });
});
