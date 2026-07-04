import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { Result } from "better-result";
import {
  ClaimConflictError,
  CloudRunFailedError,
  CloudWorkerInfrastructureError,
  IterationCapError,
  MissingConnectionError,
} from "../src/errors.js";
import {
  cloudRunResultToExitCode,
  infrastructureResultToExitCode,
  parseClaimConflict,
} from "../src/result-helpers.js";
import { mockConfig, mockPendingRun } from "./helpers/fixtures.js";

type MockState = {
  claimThrows?: boolean;
  claimError?: unknown;
  executeThrows?: boolean;
  depsThrows?: boolean;
  orgSecretsError?: boolean;
  cloneError?: boolean;
  credentialsError?: boolean;
  pendingGetError?: boolean;
  cleanupError?: boolean;
};

const mockState: MockState = {};

function mockApiClient() {
  return {
    fetchGitCredentials: mock.fn(async () => {
      if (mockState.credentialsError) throw new Error("credentials failed");
      return { token: "t" };
    }),
    updateStatus: mock.fn(async () => undefined),
    getRun: mock.fn(async () => {
      if (mockState.pendingGetError) throw new Error("missing");
      return {
        run: {
          id: "run-1",
          workflowId: "wf-1",
          githubOwner: "acme",
          githubRepo: "repo",
          iteration: 1,
          createdAt: new Date().toISOString(),
        },
      };
    }),
  };
}

before(() => {
  mock.module("@openharness/workflow-executor", {
    namedExports: {
      MAX_WORKFLOW_ITERATIONS: 5,
      claimCloudWorkflowRunInternal: mock.fn(async () => {
        if (mockState.claimThrows) throw mockState.claimError ?? new Error("not available (409)");
        return {};
      }),
      cleanupRunWorktrees: mock.fn(async () => {
        if (mockState.cleanupError) throw new Error("cleanup failed");
      }),
      createInternalWorkflowRunApiClient: mock.fn(() => mockApiClient()),
      ensureRepoClone: mock.fn(async () => {
        if (mockState.cloneError) throw new Error("clone failed");
        return "/repo";
      }),
      executeWorkflowRun: mock.fn(async () => {
        if (mockState.executeThrows) throw new Error("execute failed");
      }),
    },
  });

  mock.module("../src/executor-adapters.js", {
    namedExports: {
      resolveCloudOrgSecrets: mock.fn(async () => {
        if (mockState.orgSecretsError) {
          return Result.err(
            new CloudWorkerInfrastructureError({ operation: "secrets", cause: new Error("x") }),
          );
        }
        return Result.ok([]);
      }),
      createCloudWorkflowExecutorDeps: mock.fn(async () => {
        if (mockState.depsThrows) throw new Error("deps failed");
        return {
          events: {
            flush: mock.fn(async () => undefined),
          },
        };
      }),
      cleanupCloudPiAgentDir: mock.fn(() => undefined),
    },
  });
});

describe("result helpers", () => {
  it("parses claim conflicts and maps exit codes", () => {
    assert.ok(parseClaimConflict(new Error("not available"), "run-1"));
    assert.equal(parseClaimConflict("down", "run-1"), null);
    assert.equal(cloudRunResultToExitCode(Result.ok(undefined)), 0);
    assert.equal(
      cloudRunResultToExitCode(Result.err(new ClaimConflictError({ runId: "run-1" }))),
      0,
    );
    assert.equal(
      infrastructureResultToExitCode(
        Result.err(new CloudRunFailedError({ runId: "run-1", cause: new Error("x") })),
      ),
      1,
    );
  });
});

describe("executeCloudRun", () => {
  let modPromise: Promise<typeof import("../src/execute-cloud-run.js")>;

  before(async () => {
    modPromise = import("../src/execute-cloud-run.js");
  });

  afterEach(() => {
    for (const key of Object.keys(mockState)) {
      delete mockState[key as keyof MockState];
    }
  });

  it("completes a successful cloud run", async () => {
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(Result.isOk(result));
  });

  it("returns claim conflict", async () => {
    mockState.claimThrows = true;
    mockState.claimError = new Error("not available (409)");
    const { executeCloudRun } = await modPromise;
    const conflict = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(ClaimConflictError.is(conflict.error));
  });

  it("returns infrastructure error when claim fails", async () => {
    mockState.claimThrows = true;
    mockState.claimError = new Error("network");
    const { executeCloudRun } = await modPromise;
    const failedClaim = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudWorkerInfrastructureError.is(failedClaim.error));
  });

  it("returns iteration cap error", async () => {
    const { executeCloudRun } = await modPromise;
    const cap = await executeCloudRun(mockConfig(), mockPendingRun({ iteration: 99 }));
    assert.ok(IterationCapError.is(cap.error));
  });

  it("returns missing connection error", async () => {
    const { executeCloudRun } = await modPromise;
    const noConn = await executeCloudRun(
      mockConfig(),
      mockPendingRun({ projectSourceControlConnectionId: "" }),
    );
    assert.ok(MissingConnectionError.is(noConn.error));
  });

  it("returns org secrets infrastructure error", async () => {
    mockState.orgSecretsError = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns clone infrastructure error", async () => {
    mockState.cloneError = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns deps infrastructure error", async () => {
    mockState.depsThrows = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns execute failure and flushes events", async () => {
    mockState.executeThrows = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudRunFailedError.is(result.error));
  });

  it("returns credentials infrastructure error", async () => {
    mockState.credentialsError = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns cleanup errors without failing the run", async () => {
    mockState.cleanupError = true;
    const { executeCloudRun } = await modPromise;
    const result = await executeCloudRun(mockConfig(), mockPendingRun());
    assert.ok(Result.isOk(result));
  });

  it("supports azure devops provider", async () => {
    const { executeCloudRun } = await modPromise;
    const azureResult = await executeCloudRun(
      mockConfig(),
      mockPendingRun({ provider: "azure_devops" }),
    );
    assert.ok(Result.isOk(azureResult));
  });

  it("fetches pending runs from the API", async () => {
    const { pendingRunFromApi } = await modPromise;
    const ok = await pendingRunFromApi(mockConfig(), "run-1", "org-1");
    assert.ok(Result.isOk(ok));
    assert.equal(ok.value.id, "run-1");
  });

  it("wraps pending run fetch failures", async () => {
    mockState.pendingGetError = true;
    const { pendingRunFromApi } = await modPromise;
    const err = await pendingRunFromApi(mockConfig(), "run-1", "org-1");
    assert.ok(Result.isError(err));
  });
});
