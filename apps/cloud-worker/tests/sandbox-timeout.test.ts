import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import {
  remainingMsUntilExpiry,
  startSandboxTimeoutExtender,
} from "../src/sandbox-timeout.js";

type SandboxMock = {
  expiresAt?: Date;
  extendTimeout?: ReturnType<typeof mock.fn>;
  getError?: Error;
};

let sandboxMock: SandboxMock = {};

describe("sandbox timeout extender", () => {
  before(() => {
    mock.module("@vercel/sandbox", {
      namedExports: {
        Sandbox: {
          get: async () => {
            if (sandboxMock.getError) throw sandboxMock.getError;
            return {
              expiresAt: sandboxMock.expiresAt,
              extendTimeout: sandboxMock.extendTimeout ?? (async () => undefined),
            };
          },
        },
      },
    });
  });

  afterEach(() => {
    sandboxMock = {};
    mock.timers.reset();
    delete process.env.VERCEL_SANDBOX_NAME;
    delete process.env.VERCEL_SANDBOX_ID;
  });

  after(() => {
    mock.restoreAll();
  });

  it("computes remaining milliseconds", () => {
    const nowMs = Date.parse("2026-07-04T10:00:00.000Z");
    const expiresAt = new Date("2026-07-04T10:04:00.000Z");
    assert.equal(remainingMsUntilExpiry(expiresAt, nowMs), 4 * 60 * 1000);
    assert.equal(remainingMsUntilExpiry(undefined), undefined);
    assert.equal(remainingMsUntilExpiry(new Date("invalid")), undefined);
  });

  it("returns no-op extender without sandbox name", () => {
    const extender = startSandboxTimeoutExtender();
    assert.doesNotThrow(() => extender.stop());
  });

  it("uses env sandbox name and deprecated sandboxId option", () => {
    process.env.VERCEL_SANDBOX_NAME = "from-env";
    startSandboxTimeoutExtender().stop();

    startSandboxTimeoutExtender({ sandboxId: "legacy-id" }).stop();
  });

  async function runIntervalTick(pollMs: number): Promise<void> {
    mock.timers.enable({ apis: ["setInterval"] });
    mock.timers.tick(pollMs);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  it("extends sandbox timeout when within threshold", async () => {
    const extendTimeout = mock.fn(async () => undefined);
    sandboxMock = {
      expiresAt: new Date(Date.now() + 60_000),
      extendTimeout,
    };

    const log = mock.method(console, "log", () => undefined);
    const extender = startSandboxTimeoutExtender({
      sandboxName: "sandbox-1",
      pollMs: 10,
      thresholdMs: 5 * 60 * 1000,
      extendByMs: 1000,
    });

    await runIntervalTick(10);
    extender.stop();
    assert.ok(extendTimeout.mock.calls.length >= 1);
    log.mock.restore();
  });

  it("skips extension when expiresAt is missing", async () => {
    const warn = mock.method(console, "warn", () => undefined);
    sandboxMock = { expiresAt: undefined };

    const extender = startSandboxTimeoutExtender({ sandboxName: "sandbox-2", pollMs: 10 });
    await runIntervalTick(10);
    extender.stop();
    assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("skipped")));
    warn.mock.restore();
  });

  it("skips extension when remaining time is out of threshold", async () => {
    const extendTimeout = mock.fn(async () => undefined);
    sandboxMock = {
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      extendTimeout,
    };

    const extender = startSandboxTimeoutExtender({ sandboxName: "sandbox-3", pollMs: 10 });
    await runIntervalTick(10);
    extender.stop();
    assert.equal(extendTimeout.mock.calls.length, 0);
  });

  it("logs extension failures", async () => {
    const warn = mock.method(console, "warn", () => undefined);
    sandboxMock = { getError: new Error("sandbox missing") };

    const extender = startSandboxTimeoutExtender({ sandboxName: "sandbox-4", pollMs: 10 });
    await runIntervalTick(10);
    extender.stop();
    assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes("failed")));
    warn.mock.restore();
  });
});
