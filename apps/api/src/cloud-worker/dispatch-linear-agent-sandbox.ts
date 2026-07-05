import type { Database } from "@openharness/db";
import { Result } from "better-result";
import { DispatchError } from "../errors.js";
import { errorMessage, tryPromiseAllowFailure } from "../result-helpers.js";
import { env } from "../env.js";
import {
  claimIssueWorkspaceForRun,
  expireIssueWorkspacesPastIdleTtl,
  invalidateIssueWorkspace,
  issueSandboxName,
  updateLinearAgentRunRunnerKind,
} from "../linear/linear-agent-issue-workspace-db.js";
import {
  getLinearAgentRunForOrg,
  updateLinearAgentRunStatus,
} from "../linear/linear-agent-db.js";
import {
  createBundleSnapshotSandbox,
  ensureRepoTemplateSandbox,
  forkRunSandbox,
  runSandboxName,
  type RepoTemplateCacheStatus,
} from "./repo-template-sandbox.js";
import { getSandboxByName } from "./sandbox-client.js";
import {
  SANDBOX_BUNDLE_ROOT,
  cloudWorkerBundleFingerprint,
  isSandboxDispatchEnabled,
  sandboxDispatchDisabledReason,
} from "./sandbox-dispatch-env.js";

export type LinearAgentWorkspaceMode = "cold" | "create" | "reuse";

export type DispatchCloudLinearAgentRunSuccess = {
  sandboxName: string;
  templateCache: RepoTemplateCacheStatus | "fork_fallback" | "issue_workspace";
  workspaceMode: LinearAgentWorkspaceMode;
};

function sandboxWorkerId(runId: string, workspaceMode: LinearAgentWorkspaceMode): string {
  if (workspaceMode === "cold") {
    return `sandbox-agent-${runId}`;
  }
  return `sandbox-agent-issue-worker`;
}

function buildWorkerEnv(input: {
  runId: string;
  organizationId: string;
  sandboxName: string;
  secret: string;
  workspaceMode: LinearAgentWorkspaceMode;
  linearIssueId?: string | null;
}): Record<string, string> {
  return {
    OPENHARNESS_API_URL: env.betterAuthUrl(),
    CLOUD_WORKER_SECRET: input.secret,
    OPENHARNESS_ROOT: SANDBOX_BUNDLE_ROOT,
    OPENHARNESS_REPOS_ROOT: "/tmp/openharness/repos",
    OPENHARNESS_WORKTREES_ROOT: "/tmp/openharness/worktrees",
    OPENHARNESS_PI_AGENT_ROOT: "/tmp/openharness/pi",
    CLOUD_WORKER_ID: sandboxWorkerId(input.runId, input.workspaceMode),
    RUN_ID: input.runId,
    ORGANIZATION_ID: input.organizationId,
    VERCEL_SANDBOX_NAME: input.sandboxName,
    OPENHARNESS_WORKSPACE_MODE: input.workspaceMode,
    ...(input.linearIssueId ? { OPENHARNESS_LINEAR_ISSUE_ID: input.linearIssueId } : {}),
  };
}

async function startDetachedAgentRunOnce(
  sandbox: Awaited<ReturnType<typeof createBundleSnapshotSandbox>>,
  input: {
    runId: string;
    organizationId: string;
    workerEnv: Record<string, string>;
  },
): Promise<void> {
  await sandbox.runCommand({
    cmd: "node",
    args: [
      "cloud-worker/dist/index.js",
      "agent-run-once",
      "--run-id",
      input.runId,
      "--organization-id",
      input.organizationId,
    ],
    cwd: SANDBOX_BUNDLE_ROOT,
    env: input.workerEnv,
    detached: true,
  });
}

type ColdDispatchInput = {
  db: Database;
  runId: string;
  organizationId: string;
  snapshotId: string;
  secret: string;
  projectSourceControlConnectionId: string;
  provider: "github" | "azure_devops";
  namespace: string;
  repoName: string;
  linearIssueId?: string | null;
};

async function dispatchColdLinearAgentRun(
  input: ColdDispatchInput,
): Promise<Result<DispatchCloudLinearAgentRunSuccess, DispatchError>> {
  let templateCache: RepoTemplateCacheStatus | "fork_fallback" = "fork_fallback";

  const templateResult = await ensureRepoTemplateSandbox({
    db: input.db,
    organizationId: input.organizationId,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId,
    provider: input.provider,
    namespace: input.namespace,
    repoName: input.repoName,
    bundleSnapshotId: input.snapshotId,
  });

  const sandboxName = runSandboxName(`agent-${input.runId}`);
  const workerEnv = buildWorkerEnv({
    runId: input.runId,
    organizationId: input.organizationId,
    sandboxName,
    secret: input.secret,
    workspaceMode: "cold",
    linearIssueId: input.linearIssueId,
  });

  if (Result.isOk(templateResult)) {
    const forkResult = await tryPromiseAllowFailure(async () => {
      const sandbox = await forkRunSandbox({
        templateName: templateResult.value.templateName,
        runId: `agent-${input.runId}`,
        env: workerEnv,
      });
      await startDetachedAgentRunOnce(sandbox, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });
      await updateLinearAgentRunRunnerKind(input.db, input.runId, input.organizationId, "cloud");
      return {
        sandboxName,
        templateCache: templateResult.value.cacheStatus,
        workspaceMode: "cold" as const,
      };
    });
    if (Result.isOk(forkResult)) {
      return Result.ok(forkResult.value);
    }
    console.warn("[cloud-worker/dispatch] linear agent fork failed; falling back", forkResult.error);
    templateCache = "fork_fallback";
  }

  return Result.tryPromise({
    try: async () => {
      const sandbox = await createBundleSnapshotSandbox({
        bundleSnapshotId: input.snapshotId,
        runId: `agent-${input.runId}`,
      });
      await startDetachedAgentRunOnce(sandbox, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });
      await updateLinearAgentRunRunnerKind(input.db, input.runId, input.organizationId, "cloud");
      return { sandboxName, templateCache, workspaceMode: "cold" as const };
    },
    catch: (cause) =>
      new DispatchError({
        message: errorMessage(cause),
      }),
  });
}

async function dispatchIssueWorkspaceLinearAgentRun(input: {
  db: Database;
  runId: string;
  organizationId: string;
  snapshotId: string;
  secret: string;
  projectSourceControlConnectionId: string;
  provider: "github" | "azure_devops";
  namespace: string;
  repoName: string;
  linearIssueId: string;
  workspaceMode: "create" | "reuse";
  sandboxName: string;
}): Promise<Result<DispatchCloudLinearAgentRunSuccess, DispatchError>> {
  const workerEnv = buildWorkerEnv({
    runId: input.runId,
    organizationId: input.organizationId,
    sandboxName: input.sandboxName,
    secret: input.secret,
    workspaceMode: input.workspaceMode,
    linearIssueId: input.linearIssueId,
  });

  if (input.workspaceMode === "reuse") {
    const reuseResult = await tryPromiseAllowFailure(async () => {
      const sandbox = await getSandboxByName(input.sandboxName, { resume: true });
      await startDetachedAgentRunOnce(sandbox, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });
      await updateLinearAgentRunRunnerKind(
        input.db,
        input.runId,
        input.organizationId,
        "issue_workspace",
      );
      console.info("[linear-agent/workspace] reuse hit", {
        runId: input.runId,
        linearIssueId: input.linearIssueId,
        sandboxName: input.sandboxName,
      });
      return {
        sandboxName: input.sandboxName,
        templateCache: "issue_workspace" as const,
        workspaceMode: "reuse" as const,
      };
    });
    if (Result.isOk(reuseResult)) {
      return Result.ok(reuseResult.value);
    }
    await invalidateIssueWorkspace(input.db, input.organizationId, input.linearIssueId);
    console.warn("[linear-agent/workspace] resume failed; falling back to cold path", reuseResult.error);
    return dispatchColdLinearAgentRun(input);
  }

  const templateResult = await ensureRepoTemplateSandbox({
    db: input.db,
    organizationId: input.organizationId,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId,
    provider: input.provider,
    namespace: input.namespace,
    repoName: input.repoName,
    bundleSnapshotId: input.snapshotId,
  });

  if (Result.isError(templateResult)) {
    return dispatchColdLinearAgentRun(input);
  }

  const createResult = await tryPromiseAllowFailure(async () => {
    const sandbox = await forkRunSandbox({
      templateName: templateResult.value.templateName,
      runId: input.sandboxName,
      sandboxName: input.sandboxName,
      persistent: true,
      env: workerEnv,
    });
    await startDetachedAgentRunOnce(sandbox, {
      runId: input.runId,
      organizationId: input.organizationId,
      workerEnv,
    });
    await updateLinearAgentRunRunnerKind(
      input.db,
      input.runId,
      input.organizationId,
      "issue_workspace",
    );
    console.info("[linear-agent/workspace] created issue sandbox", {
      runId: input.runId,
      linearIssueId: input.linearIssueId,
      sandboxName: input.sandboxName,
    });
    return {
      sandboxName: input.sandboxName,
      templateCache: templateResult.value.cacheStatus,
      workspaceMode: "create" as const,
    };
  });
  if (Result.isOk(createResult)) {
    return Result.ok(createResult.value);
  }

  await invalidateIssueWorkspace(input.db, input.organizationId, input.linearIssueId);
  console.warn("[linear-agent/workspace] create failed; falling back to cold path", createResult.error);
  return dispatchColdLinearAgentRun(input);
}

export async function dispatchCloudLinearAgentRun(
  db: Database,
  input: {
    runId: string;
    organizationId: string;
  },
): Promise<Result<DispatchCloudLinearAgentRunSuccess, DispatchError>> {
  const snapshotId = env.cloudWorkerSnapshotId();
  const secret = env.cloudWorkerSecret();
  if (!snapshotId || !secret) {
    return Result.err(
      new DispatchError({ message: "Cloud worker snapshot or secret is not configured" }),
    );
  }

  const run = await getLinearAgentRunForOrg(db, input.organizationId, input.runId);
  if (!run) {
    return Result.err(new DispatchError({ message: "Linear agent run not found" }));
  }

  const projectSourceControlConnectionId = run.projectSourceControlConnectionId?.trim() ?? "";
  if (!projectSourceControlConnectionId) {
    return Result.err(
      new DispatchError({ message: "Missing project source control connection for linear agent run" }),
    );
  }

  const namespace = run.namespace.trim();
  const repoName = run.repoName.trim();
  if (!namespace || !repoName) {
    return Result.err(
      new DispatchError({ message: "Missing repository coordinates for linear agent run" }),
    );
  }

  const provider: "github" | "azure_devops" =
    run.provider === "azure_devops" ? "azure_devops" : "github";
  const linearIssueId = run.linearIssueId?.trim() ?? "";
  const bundleFingerprint = cloudWorkerBundleFingerprint();

  await updateLinearAgentRunRunnerKind(
    db,
    input.runId,
    input.organizationId,
    linearIssueId && bundleFingerprint ? "issue_workspace" : "cloud",
  );

  const baseInput: ColdDispatchInput = {
    db,
    runId: input.runId,
    organizationId: input.organizationId,
    snapshotId,
    secret,
    projectSourceControlConnectionId,
    provider,
    namespace,
    repoName,
    linearIssueId: linearIssueId || null,
  };

  if (!linearIssueId || !bundleFingerprint) {
    return dispatchColdLinearAgentRun(baseInput);
  }

  await expireIssueWorkspacesPastIdleTtl(db);

  const sandboxName = issueSandboxName(input.organizationId, linearIssueId);
  let claim = await claimIssueWorkspaceForRun(db, {
    organizationId: input.organizationId,
    linearIssueId,
    runId: input.runId,
    projectSourceControlConnectionId,
    bundleFingerprint,
    sandboxName,
  });

  if (!claim.ok && (claim.reason === "incompatible" || claim.reason === "expired")) {
    await invalidateIssueWorkspace(db, input.organizationId, linearIssueId);
    claim = await claimIssueWorkspaceForRun(db, {
      organizationId: input.organizationId,
      linearIssueId,
      runId: input.runId,
      projectSourceControlConnectionId,
      bundleFingerprint,
      sandboxName,
    });
  }

  if (!claim.ok) {
    if (claim.reason === "active_run") {
      console.info("[linear-agent/workspace] active run on issue; using cold path", {
        runId: input.runId,
        linearIssueId,
      });
    }
    return dispatchColdLinearAgentRun(baseInput);
  }

  return dispatchIssueWorkspaceLinearAgentRun({
    ...baseInput,
    linearIssueId,
    workspaceMode: claim.mode,
    sandboxName,
  });
}

export async function maybeDispatchCloudLinearAgentRun(
  db: Database,
  input: { runId: string; organizationId: string },
): Promise<void> {
  if (!isSandboxDispatchEnabled()) {
    const reason = sandboxDispatchDisabledReason();
    if (reason) {
      console.warn("[cloud-worker/dispatch] linear agent sandbox dispatch disabled:", reason);
    }
    return;
  }

  const result = await dispatchCloudLinearAgentRun(db, input);
  if (Result.isError(result)) {
    await updateLinearAgentRunStatus(db, input.runId, input.organizationId, "failed", {
      errorMessage: `Cloud sandbox dispatch failed: ${result.error.message}`,
    });
  }
}
