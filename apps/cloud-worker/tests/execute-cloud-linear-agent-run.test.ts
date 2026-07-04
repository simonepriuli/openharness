import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import { Result } from "better-result";
import {
  CloudRunFailedError,
  CloudWorkerInfrastructureError,
  MissingConnectionError,
} from "../src/errors.js";
import { mockConfig, mockPendingLinearAgentRun } from "./helpers/fixtures.js";

type MockState = {
  claimThrows?: boolean;
  claimError?: unknown;
  executeThrows?: boolean;
  orgSecretsError?: boolean;
  cloneError?: boolean;
  credentialsError?: boolean;
  depsThrows?: boolean;
  pendingGetError?: boolean;
};

const mockState: MockState = {};

before(() => {
  mock.module("@openharness/workflow-executor", {
    namedExports: {
      claimLinearAgentRunInternal: mock.fn(async () => {
        if (mockState.claimThrows) throw mockState.claimError ?? new Error("not available");
        return {};
      }),
      cleanupRunWorktrees: mock.fn(async () => undefined),
      createInternalLinearAgentRunApiClient: mock.fn(() => ({
        emitActivity: mock.fn(async () => undefined),
        fetchGitCredentials: mock.fn(async () => {
          if (mockState.credentialsError) throw new Error("credentials failed");
          return { token: "t" };
        }),
        updateStatus: mock.fn(async () => undefined),
        getRun: mock.fn(async () => {
          if (mockState.pendingGetError) throw new Error("missing");
          return { run: mockPendingLinearAgentRun() };
        }),
      })),
      ensureRepoClone: mock.fn(async () => {
        if (mockState.cloneError) throw new Error("clone failed");
        return "/repo";
      }),
      executeLinearAgentRun: mock.fn(async () => {
        if (mockState.executeThrows) throw new Error("agent failed");
      }),
      extractLinearAgentConfig: mock.fn(() => ({ tools: undefined })),
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
      cleanupCloudLinearAgentPiDir: mock.fn(() => undefined),
    },
  });
  mock.module("../src/executor-adapters-linear-agent.js", {
    namedExports: {
      createCloudLinearAgentExecutorDeps: mock.fn(async () => {
        if (mockState.depsThrows) throw new Error("deps failed");
        return {
          piAgentDir: "/agent",
          events: { append: () => undefined, snapshotMessages: () => [] },
          secrets: {},
        };
      }),
    },
  });
});

describe("executeCloudLinearAgentRun", () => {
  const envBackup = { ...process.env };
  let modPromise: Promise<typeof import("../src/execute-cloud-linear-agent-run.js")>;

  before(async () => {
    modPromise = import("../src/execute-cloud-linear-agent-run.js");
  });

  afterEach(() => {
    process.env = { ...envBackup };
    for (const key of Object.keys(mockState)) {
      delete mockState[key as keyof MockState];
    }
  });

  it("retains sandbox for create and reuse modes", async () => {
    const { shouldRetainLinearAgentSandbox } = await modPromise;
    process.env.OPENHARNESS_WORKSPACE_MODE = "create";
    assert.equal(shouldRetainLinearAgentSandbox(), true);
    process.env.OPENHARNESS_WORKSPACE_MODE = "reuse";
    assert.equal(shouldRetainLinearAgentSandbox(), true);
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    assert.equal(shouldRetainLinearAgentSandbox(), false);
    delete process.env.OPENHARNESS_WORKSPACE_MODE;
    assert.equal(shouldRetainLinearAgentSandbox(), false);
    process.env.OPENHARNESS_WORKSPACE_MODE = "invalid";
    assert.equal(shouldRetainLinearAgentSandbox(), false);
  });

  it("runs a successful linear agent cloud run in cold mode", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun());
    assert.ok(Result.isOk(result));
  });

  it("runs a successful linear agent cloud run in reuse mode with issue env", async () => {
    process.env.OPENHARNESS_LINEAR_ISSUE_ID = "issue-env";
    process.env.OPENHARNESS_WORKSPACE_MODE = "reuse";
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun());
    assert.ok(Result.isOk(result));
  });

  it("returns claim conflict", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.claimThrows = true;
    mockState.claimError = new Error("not available (409)");
    const { executeCloudLinearAgentRun } = await modPromise;
    const conflict = await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun());
    assert.ok(Result.isError(conflict));
  });

  it("returns missing connection error", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    const { executeCloudLinearAgentRun } = await modPromise;
    const failed = await executeCloudLinearAgentRun(
      mockConfig(),
      mockPendingLinearAgentRun({ projectSourceControlConnectionId: "" }),
    );
    assert.ok(MissingConnectionError.is(failed.error));
  });

  it("uses linear issue id from the run record", async () => {
    delete process.env.OPENHARNESS_LINEAR_ISSUE_ID;
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(
      mockConfig(),
      mockPendingLinearAgentRun({ linearIssueId: "issue-from-run" }),
    );
    assert.ok(Result.isOk(result));
  });

  it("returns credentials infrastructure error", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.credentialsError = true;
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns infrastructure error when claim fails without conflict", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.claimThrows = true;
    mockState.claimError = new Error("network down");
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun());
    assert.ok(CloudWorkerInfrastructureError.is(result.error));
  });

  it("returns execute failure in cold mode", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.executeThrows = true;
    const { executeCloudLinearAgentRun } = await modPromise;
    const execFail = await executeCloudLinearAgentRun(
      mockConfig(),
      mockPendingLinearAgentRun({ projectSourceControlConnectionId: "conn-1" }),
    );
    assert.ok(CloudRunFailedError.is(execFail.error));
  });

  it("supports azure devops provider", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    const { executeCloudLinearAgentRun } = await modPromise;
    const result = await executeCloudLinearAgentRun(
      mockConfig(),
      mockPendingLinearAgentRun({ provider: "azure_devops" }),
    );
    assert.ok(Result.isOk(result));
  });

  it("returns infrastructure error for org secrets", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.orgSecretsError = true;
    const { executeCloudLinearAgentRun } = await modPromise;
    assert.ok(
      CloudWorkerInfrastructureError.is(
        (await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun())).error,
      ),
    );
  });

  it("returns infrastructure error for clone failures", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.cloneError = true;
    const { executeCloudLinearAgentRun } = await modPromise;
    assert.ok(
      CloudWorkerInfrastructureError.is(
        (await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun())).error,
      ),
    );
  });

  it("returns infrastructure error for deps failures", async () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    mockState.depsThrows = true;
    const { executeCloudLinearAgentRun } = await modPromise;
    assert.ok(
      CloudWorkerInfrastructureError.is(
        (await executeCloudLinearAgentRun(mockConfig(), mockPendingLinearAgentRun())).error,
      ),
    );
  });

  it("loads pending linear agent runs from the API", async () => {
    const { pendingLinearAgentRunFromApi } = await modPromise;
    const ok = await pendingLinearAgentRunFromApi(mockConfig(), "run-1", "org-1");
    assert.ok(Result.isOk(ok));
  });

  it("wraps pending linear agent run fetch failures", async () => {
    mockState.pendingGetError = true;
    const { pendingLinearAgentRunFromApi } = await modPromise;
    const err = await pendingLinearAgentRunFromApi(mockConfig(), "run-1", "org-1");
    assert.ok(Result.isError(err));
  });
});
