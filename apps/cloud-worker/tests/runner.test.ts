import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { Result } from "better-result";
import { CloudRunFailedError } from "../src/errors.js";
import { mockConfig, mockPendingLinearAgentRun, mockPendingRun } from "./helpers/fixtures.js";

type MockState = {
  listRunsError?: unknown;
  returnEmptyCloudRuns?: boolean;
  listAgentRunsError?: unknown;
  fetchRunsError?: unknown;
  fetchAgentRuns?: unknown[];
  fetchRuns?: unknown[];
  executeRunError?: boolean;
  executeAgentError?: boolean;
};

const mockState: MockState = {};

before(() => {
  mock.module("@openharness/workflow-executor", {
    namedExports: {
      listActiveCloudRunsForWorker: mock.fn(async () => {
        if (mockState.listRunsError) throw mockState.listRunsError;
        if (mockState.returnEmptyCloudRuns) return [];
        return [{ id: "stale-1", organizationId: "org-1", status: "running" }];
      }),
      listActiveLinearAgentRunsForWorker: mock.fn(async () => {
        if (mockState.listAgentRunsError) throw mockState.listAgentRunsError;
        return [{ id: "stale-agent-1", organizationId: "org-1", status: "running" }];
      }),
      fetchPendingCloudRuns: mock.fn(async () => {
        if (mockState.fetchRunsError) throw mockState.fetchRunsError;
        return mockState.fetchRuns ?? [mockPendingRun()];
      }),
      fetchPendingLinearAgentRuns: mock.fn(async () => {
        return mockState.fetchAgentRuns ?? [mockPendingLinearAgentRun()];
      }),
      createInternalWorkflowRunApiClient: mock.fn(() => ({
        updateStatus: mock.fn(async () => undefined),
      })),
      createInternalLinearAgentRunApiClient: mock.fn(() => ({
        updateStatus: mock.fn(async () => undefined),
      })),
    },
  });
  mock.module("../src/execute-cloud-run.js", {
    namedExports: {
      executeCloudRun: mock.fn(async () => {
        if (mockState.executeRunError) {
          return Result.err(new CloudRunFailedError({ runId: "run-1", cause: new Error("x") }));
        }
        return Result.ok(undefined);
      }),
    },
  });
  mock.module("../src/execute-cloud-linear-agent-run.js", {
    namedExports: {
      executeCloudLinearAgentRun: mock.fn(async () => {
        if (mockState.executeAgentError) {
          return Result.err(new CloudRunFailedError({ runId: "agent-run-1", cause: new Error("x") }));
        }
        return Result.ok(undefined);
      }),
    },
  });
});

describe("CloudWorkflowRunner", () => {
  let modPromise: Promise<typeof import("../src/runner.js")>;

  before(async () => {
    modPromise = import("../src/runner.js");
  });

  afterEach(() => {
    for (const key of Object.keys(mockState)) {
      delete mockState[key as keyof MockState];
    }
  });

  it("starts, polls, processes runs, and shuts down", async () => {
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.stop();
    assert.ok(true);
  });

  it("logs reconciliation and poll failures", async () => {
    mockState.listRunsError = new Error("ECONNREFUSED");
    mockState.listAgentRunsError = new Error("ECONNREFUSED");
    mockState.fetchRunsError = Object.assign(new Error("fail"), { cause: { code: "ECONNREFUSED" } });
    mockState.fetchAgentRuns = [];
    mockState.fetchRuns = [];

    const errorLog = mock.method(console, "error", () => undefined);
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    await runner.reconcileStaleRuns();
    await runner.reconcileStaleLinearAgentRuns();
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.stop();
    assert.ok(errorLog.mock.calls.length > 0);
    errorLog.mock.restore();
  });

  it("ignores duplicate start calls", async () => {
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    runner.start();
    runner.stop();
  });

  it("returns early when runner is not started", async () => {
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    assert.equal(await runner.reconcileStaleRuns(), 0);
    assert.equal(await runner.reconcileStaleLinearAgentRuns(), 0);
  });

  it("reconciles stale runs when worker is started", async () => {
    mockState.fetchRuns = [];
    mockState.fetchAgentRuns = [];
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    const reconciled = await runner.reconcileStaleRuns();
    assert.equal(reconciled, 1);
    runner.stop();
  });

  it("reconciles stale linear agent runs when worker is started", async () => {
    mockState.returnEmptyCloudRuns = true;
    mockState.fetchRuns = [];
    mockState.fetchAgentRuns = [];
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    const reconciled = await runner.reconcileStaleLinearAgentRuns();
    assert.equal(reconciled, 1);
    runner.stop();
  });

  it("formats non-error fetch failures", async () => {
    mockState.listRunsError = "plain failure";
    mockState.fetchRuns = [];
    mockState.fetchAgentRuns = [];

    const errorLog = mock.method(console, "error", () => undefined);
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    await runner.reconcileStaleRuns();
    runner.stop();
    assert.ok(errorLog.mock.calls.some((call) => String(call.arguments[1]).includes("plain failure")));
    errorLog.mock.restore();
  });

  it("processes failed linear agent runs from the queue", async () => {
    mockState.executeAgentError = true;
    mockState.fetchRuns = [];
    const errorLog = mock.method(console, "error", () => undefined);
    const { CloudWorkflowRunner } = await modPromise;
    const runner = new CloudWorkflowRunner(mockConfig());
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.stop();
    assert.ok(errorLog.mock.calls.some((call) => String(call.arguments[0]).includes("linear agent run failed")));
    errorLog.mock.restore();
  });
});
