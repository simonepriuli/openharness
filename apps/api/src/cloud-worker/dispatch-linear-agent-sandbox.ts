import type { Database } from "@openharness/db";
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

export type DispatchCloudLinearAgentRunResult =
  | {
      ok: true;
      sandboxName: string;
      templateCache: RepoTemplateCacheStatus | "fork_fallback" | "issue_workspace";
      workspaceMode: LinearAgentWorkspaceMode;
    }
  | { ok: false; error: string };

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

async function dispatchColdLinearAgentRun(input: {
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
}): Promise<DispatchCloudLinearAgentRunResult> {
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

  let sandbox: Awaited<ReturnType<typeof createBundleSnapshotSandbox>>;

  if (templateResult.ok) {
    templateCache = templateResult.cacheStatus;
    try {
      sandbox = await forkRunSandbox({
        templateName: templateResult.templateName,
        runId: `agent-${input.runId}`,
        env: workerEnv,
      });
      await startDetachedAgentRunOnce(sandbox, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });
      await updateLinearAgentRunRunnerKind(input.db, input.runId, input.organizationId, "cloud");
      return { ok: true, sandboxName, templateCache, workspaceMode: "cold" };
    } catch (forkErr) {
      console.warn("[cloud-worker/dispatch] linear agent fork failed; falling back", forkErr);
      templateCache = "fork_fallback";
    }
  }

  sandbox = await createBundleSnapshotSandbox({
    bundleSnapshotId: input.snapshotId,
    runId: `agent-${input.runId}`,
  });
  await startDetachedAgentRunOnce(sandbox, {
    runId: input.runId,
    organizationId: input.organizationId,
    workerEnv,
  });
  await updateLinearAgentRunRunnerKind(input.db, input.runId, input.organizationId, "cloud");
  return { ok: true, sandboxName, templateCache, workspaceMode: "cold" };
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
}): Promise<DispatchCloudLinearAgentRunResult> {
  const workerEnv = buildWorkerEnv({
    runId: input.runId,
    organizationId: input.organizationId,
    sandboxName: input.sandboxName,
    secret: input.secret,
    workspaceMode: input.workspaceMode,
    linearIssueId: input.linearIssueId,
  });

  if (input.workspaceMode === "reuse") {
    try {
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
        ok: true,
        sandboxName: input.sandboxName,
        templateCache: "issue_workspace",
        workspaceMode: "reuse",
      };
    } catch (err) {
      await invalidateIssueWorkspace(input.db, input.organizationId, input.linearIssueId);
      console.warn("[linear-agent/workspace] resume failed; falling back to cold path", err);
      return dispatchColdLinearAgentRun(input);
    }
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

  if (!templateResult.ok) {
    return dispatchColdLinearAgentRun(input);
  }

  try {
    const sandbox = await forkRunSandbox({
      templateName: templateResult.templateName,
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
      ok: true,
      sandboxName: input.sandboxName,
      templateCache: templateResult.cacheStatus,
      workspaceMode: "create",
    };
  } catch (err) {
    await invalidateIssueWorkspace(input.db, input.organizationId, input.linearIssueId);
    console.warn("[linear-agent/workspace] create failed; falling back to cold path", err);
    return dispatchColdLinearAgentRun(input);
  }
}

export async function dispatchCloudLinearAgentRun(
  db: Database,
  input: {
    runId: string;
    organizationId: string;
  },
): Promise<DispatchCloudLinearAgentRunResult> {
  const snapshotId = env.cloudWorkerSnapshotId();
  const secret = env.cloudWorkerSecret();
  if (!snapshotId || !secret) {
    return { ok: false, error: "Cloud worker snapshot or secret is not configured" };
  }

  const run = await getLinearAgentRunForOrg(db, input.organizationId, input.runId);
  if (!run) {
    return { ok: false, error: "Linear agent run not found" };
  }

  const projectSourceControlConnectionId = run.projectSourceControlConnectionId?.trim() ?? "";
  if (!projectSourceControlConnectionId) {
    return { ok: false, error: "Missing project source control connection for linear agent run" };
  }

  const namespace = run.namespace.trim();
  const repoName = run.repoName.trim();
  if (!namespace || !repoName) {
    return { ok: false, error: "Missing repository coordinates for linear agent run" };
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

  const baseInput = {
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
  if (!result.ok) {
    await updateLinearAgentRunStatus(db, input.runId, input.organizationId, "failed", {
      errorMessage: `Cloud sandbox dispatch failed: ${result.error}`,
    });
  }
}
