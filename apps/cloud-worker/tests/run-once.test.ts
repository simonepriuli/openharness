import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { Result } from "better-result";
import {
  CloudRunFailedError,
  CloudWorkerInfrastructureError,
  SandboxStopError,
} from "../src/errors.js";
import { mockConfig } from "./helpers/fixtures.js";
import { importFresh } from "./helpers/import-fresh.js";

type MockState = {
  pendingError?: boolean;
  executeError?: boolean;
  stopSandboxError?: boolean;
};

const mockState: MockState = {};

before(() => {
  mock.module("../src/execute-cloud-run.js", {
    namedExports: {
      pendingRunFromApi: mock.fn(async () => {
        if (mockState.pendingError) {
          return Result.err(
            new CloudWorkerInfrastructureError({
              operation: "fetch",
              cause: new Error("x"),
            }),
          );
        }
        return Result.ok({
          id: "run-1",
          organizationId: "org-1",
        });
      }),
      executeCloudRun: mock.fn(async () => {
        if (mockState.executeError) {
          return Result.err(
            new CloudRunFailedError({
              runId: "run-1",
              cause: new Error("x"),
            }),
          );
        }
        return Result.ok(undefined);
      }),
    },
  });
  mock.module("../src/sandbox-timeout.js", {
    namedExports: {
      startSandboxTimeoutExtender: mock.fn(() => ({ stop: () => undefined })),
    },
  });
  mock.module("../src/sandbox-lifecycle.js", {
    namedExports: {
      stopSandboxIfPresent: mock.fn(async () => {
        if (mockState.stopSandboxError) {
          return Result.err(
            new SandboxStopError({
              sandboxName: "sb",
              cause: new Error("x"),
            }),
          );
        }
        return Result.ok(undefined);
      }),
    },
  });
});

describe("run once commands", () => {
  let modPromise: Promise<typeof import("../src/run-once.js")>;

  before(async () => {
    modPromise = import("../src/run-once.js");
  });

  afterEach(() => {
    for (const key of Object.keys(mockState)) {
      delete mockState[key as keyof MockState];
    }
  });

  it("runs workflow run-once and returns exit codes", async () => {
    const { runOnceCommand } = await modPromise;
    assert.equal(
      await runOnceCommand(mockConfig(), { runId: "run-1", organizationId: "org-1" }),
      0,
    );
  });

  it("returns exit code 1 when pending run fetch fails", async () => {
    mockState.pendingError = true;
    mockState.stopSandboxError = true;
    const { runOnceCommand } = await modPromise;
    assert.equal(
      await runOnceCommand(mockConfig(), { runId: "run-1", organizationId: "org-1" }),
      1,
    );
  });

  it("returns exit code 1 when execute fails", async () => {
    mockState.executeError = true;
    mockState.stopSandboxError = true;
    const { runOnceCommand } = await modPromise;
    assert.equal(
      await runOnceCommand(mockConfig(), { runId: "run-1", organizationId: "org-1" }),
      1,
    );
  });
});

describe("agent run once commands", () => {
  const agentState = { pendingError: false, executeError: false, stopSandboxError: false, retain: false };

  before(() => {
    mock.module("../src/execute-cloud-linear-agent-run.js", {
      cache: false,
      namedExports: {
        pendingLinearAgentRunFromApi: mock.fn(async () => {
          if (agentState.pendingError) {
            return Result.err(
              new CloudWorkerInfrastructureError({
                operation: "fetch",
                cause: new Error("x"),
              }),
            );
          }
          return Result.ok({ id: "run-1" });
        }),
        executeCloudLinearAgentRun: mock.fn(async () => {
          if (agentState.executeError) {
            return Result.err(
              new CloudRunFailedError({ runId: "run-1", cause: new Error("x") }),
            );
          }
          return Result.ok(undefined);
        }),
        shouldRetainLinearAgentSandbox: mock.fn(() => agentState.retain),
      },
    });
  });

  afterEach(() => {
    agentState.pendingError = false;
    agentState.executeError = false;
    agentState.stopSandboxError = false;
    agentState.retain = false;
  });

  it("runs agent run-once and respects sandbox retention", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    const { agentRunOnceCommand } = await importFresh<typeof import("../src/agent-run-once.js")>(
      "../src/agent-run-once.js",
    );
    assert.equal(
      await agentRunOnceCommand(mockConfig(), { runId: "run-1", organizationId: "org-1" }),
      0,
    );
  });

  it("skips sandbox stop when sandbox is retained", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "reuse";
    agentState.retain = true;
    const { agentRunOnceCommand } = await importFresh<typeof import("../src/agent-run-once.js")>(
      "../src/agent-run-once.js",
    );
    assert.equal(
      await agentRunOnceCommand(mockConfig(), { runId: "run-1", organizationId: "org-1" }),
      0,
    );
  });
});
