import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Result } from "better-result";
import { ApiUnreachableError, CliParseError, ConfigError } from "../src/errors.js";
import { mockNoEnvLoad } from "./helpers/mock-env.js";

describe("bootstrap", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    mock.restoreAll();
  });

  async function importBootstrap() {
    mockNoEnvLoad();
    return import("../src/bootstrap.js");
  }

  it("returns fatal errors for invalid cli and config", async () => {
    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const cli = await runCloudWorkerEntrypoint(["node", "index.js", "nope"]);
    assert.equal(cli.kind, "fatal");
    assert.ok(cli.kind === "fatal" && CliParseError.is(cli.error));
  });

  it("returns exit for help", async () => {
    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const help = await runCloudWorkerEntrypoint(["node", "index.js", "help"]);
    assert.deepEqual(help, { kind: "exit", code: 0 });
  });

  it("returns exit for run-once and agent-run-once", async () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";

    mock.module("../src/run-once.js", {
      cache: false,
      namedExports: {
        runOnceCommand: mock.fn(async () => 0),
      },
    });
    mock.module("../src/agent-run-once.js", {
      cache: false,
      namedExports: {
        agentRunOnceCommand: mock.fn(async () => 1),
      },
    });

    const { runCloudWorkerEntrypoint } = await importBootstrap();

    const runOnce = await runCloudWorkerEntrypoint([
      "node",
      "index.js",
      "run-once",
      "--run-id",
      "run-1",
      "--organization-id",
      "org-1",
    ]);
    assert.deepEqual(runOnce, { kind: "exit", code: 0 });

    const agent = await runCloudWorkerEntrypoint([
      "node",
      "index.js",
      "agent-run-once",
      "--run-id",
      "run-1",
      "--organization-id",
      "org-1",
    ]);
    assert.deepEqual(agent, { kind: "exit", code: 1 });
  });

  it("returns fatal when config is missing in run-once", async () => {
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.CLOUD_WORKER_SECRET;
    delete process.env.BETTER_AUTH_URL;

    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const result = await runCloudWorkerEntrypoint([
      "node",
      "index.js",
      "run-once",
      "--run-id",
      "run-1",
      "--organization-id",
      "org-1",
    ]);
    assert.equal(result.kind, "fatal");
    assert.ok(result.kind === "fatal" && ConfigError.is(result.error));
  });

  it("returns fatal when config is missing in agent-run-once", async () => {
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.CLOUD_WORKER_SECRET;
    delete process.env.BETTER_AUTH_URL;

    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const result = await runCloudWorkerEntrypoint([
      "node",
      "index.js",
      "agent-run-once",
      "--run-id",
      "run-1",
      "--organization-id",
      "org-1",
    ]);
    assert.equal(result.kind, "fatal");
    assert.ok(result.kind === "fatal" && ConfigError.is(result.error));
  });

  it("returns fatal when config is missing for poll", async () => {
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.CLOUD_WORKER_SECRET;
    delete process.env.BETTER_AUTH_URL;

    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const result = await runCloudWorkerEntrypoint(["node", "index.js", "poll"]);
    assert.equal(result.kind, "fatal");
    assert.ok(result.kind === "fatal" && ConfigError.is(result.error));
  });

  it("returns fatal when API is unreachable for poll", async () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    mock.module("../src/api-health.js", {
      cache: false,
      namedExports: {
        waitForApiReachable: mock.fn(async () =>
          Result.err(new ApiUnreachableError({ apiUrl: "http://127.0.0.1:3001", cause: new Error("down") })),
        ),
      },
    });

    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const result = await runCloudWorkerEntrypoint(["node", "index.js", "poll"]);
    assert.equal(result.kind, "fatal");
    assert.ok(result.kind === "fatal" && ApiUnreachableError.is(result.error));
  });

  it("starts poll mode when API is reachable", async () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

    const { runCloudWorkerEntrypoint } = await importBootstrap();
    const poll = await runCloudWorkerEntrypoint(["node", "index.js", "poll"]);
    assert.equal(poll.kind, "poll");
    if (poll.kind === "poll") poll.runner.stop();
  });

  it("handleBootstrapResult exits and registers shutdown handlers", async () => {
    const { handleBootstrapResult } = await import("../src/bootstrap.js");
    const exit = mock.method(process, "exit", () => undefined as never);
    handleBootstrapResult({ kind: "exit", code: 2 });
    assert.equal(exit.mock.calls[0]?.arguments[0], 2);

    const stop = mock.fn(() => undefined);
    const on = mock.method(process, "on", () => process);
    handleBootstrapResult({
      kind: "poll",
      runner: { stop } as never,
    });
    assert.equal(on.mock.calls.length, 2);
    exit.mock.restore();
    on.mock.restore();
  });
});
