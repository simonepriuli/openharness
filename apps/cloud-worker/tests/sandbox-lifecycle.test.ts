import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { Result } from "better-result";
import { stopSandboxIfPresent } from "../src/sandbox-lifecycle.js";

describe("stopSandboxIfPresent", () => {
  const envBackup = { ...process.env };
  const originalFetch = globalThis.fetch;

  after(() => {
    process.env = { ...envBackup };
    globalThis.fetch = originalFetch;
  });

  it("no-ops without sandbox name", async () => {
    delete process.env.VERCEL_SANDBOX_NAME;
    delete process.env.VERCEL_SANDBOX_ID;
    const result = await stopSandboxIfPresent();
    assert.ok(Result.isOk(result));
  });

  it("warns when api env is missing", async () => {
    process.env.VERCEL_SANDBOX_NAME = "sandbox-1";
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.CLOUD_WORKER_SECRET;
    const warn = mock.method(console, "warn", () => undefined);
    const result = await stopSandboxIfPresent();
    assert.ok(Result.isOk(result));
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /cannot stop sandbox/);
    warn.mock.restore();
  });

  it("stops sandbox via API", async () => {
    process.env.VERCEL_SANDBOX_NAME = "sandbox-1";
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001/";
    process.env.CLOUD_WORKER_SECRET = "secret";
    const log = mock.method(console, "log", () => undefined);
    globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

    const result = await stopSandboxIfPresent();
    assert.ok(Result.isOk(result));
    assert.match(String(log.mock.calls[0]?.arguments[0]), /stopped sandbox/);
    log.mock.restore();
  });

  it("returns error when API stop fails", async () => {
    process.env.VERCEL_SANDBOX_ID = "sandbox-2";
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    globalThis.fetch = mock.fn(async () => new Response("bad", { status: 500 })) as typeof fetch;

    const result = await stopSandboxIfPresent();
    assert.ok(Result.isError(result));
    assert.match(result.error.message, /500/);
  });

  it("handles response.text failures while building stop error", async () => {
    process.env.VERCEL_SANDBOX_NAME = "sandbox-3";
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    globalThis.fetch = mock.fn(
      async () =>
        ({
          ok: false,
          status: 502,
          text: async () => {
            throw new Error("no body");
          },
        }) as Response,
    ) as typeof fetch;

    const result = await stopSandboxIfPresent();
    assert.ok(Result.isError(result));
    assert.match(result.error.message, /502/);
  });
});
