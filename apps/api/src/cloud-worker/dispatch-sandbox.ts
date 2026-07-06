import type { Database } from "@openharness/db";
import type { Sandbox } from "@vercel/sandbox";
import { Result } from "better-result";
import { DispatchError } from "../errors.js";
import { env } from "../env.js";
import { getWorkflowRunExecutionForOrg, updateWorkflowRunStatus } from "../github/workflow-db.js";
import {
  createBundleSnapshotSandbox,
  ensureRepoTemplateSandbox,
  forkRunSandbox,
  runSandboxName,
  type RepoTemplateCacheStatus,
} from "./repo-template-sandbox.js";
import {
  SANDBOX_BUNDLE_ROOT,
  isSandboxDispatchEnabled,
  sandboxDispatchDisabledReason,
} from "./sandbox-dispatch-env.js";

export type DispatchCloudWorkflowRunSuccess = {
  sandboxName: string;
  templateCache: RepoTemplateCacheStatus | "fork_fallback";
};

function sandboxWorkerId(runId: string): string {
  return `sandbox-${runId}`;
}

function buildWorkerEnv(input: {
  runId: string;
  organizationId: string;
  sandboxName: string;
  secret: string;
}): Record<string, string> {
  return {
    OPENHARNESS_API_URL: env.betterAuthUrl(),
    CLOUD_WORKER_SECRET: input.secret,
    OPENHARNESS_ROOT: SANDBOX_BUNDLE_ROOT,
    OPENHARNESS_REPOS_ROOT: "/tmp/openharness/repos",
    OPENHARNESS_WORKTREES_ROOT: "/tmp/openharness/worktrees",
    OPENHARNESS_PI_AGENT_ROOT: "/tmp/openharness/pi",
    CLOUD_WORKER_ID: sandboxWorkerId(input.runId),
    RUN_ID: input.runId,
    ORGANIZATION_ID: input.organizationId,
    VERCEL_SANDBOX_NAME: input.sandboxName,
  };
}

async function startDetachedRunOnce(
  sandbox: Sandbox,
  input: { runId: string; organizationId: string; workerEnv: Record<string, string> },
): Promise<void> {
  await sandbox.runCommand({
    cmd: "node",
    args: [
      "cloud-worker/dist/index.js",
      "run-once",
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

async function startForkedSandboxRun(input: {
  runId: string;
  organizationId: string;
  secret: string;
  templateName: string;
  templateCache: RepoTemplateCacheStatus;
}): Promise<Result<DispatchCloudWorkflowRunSuccess, DispatchError>> {
  const sandboxName = runSandboxName(input.runId);
  const workerEnv = buildWorkerEnv({
    runId: input.runId,
    organizationId: input.organizationId,
    sandboxName,
    secret: input.secret,
  });
  const forkResult = await forkRunSandbox({
    templateName: input.templateName,
    runId: input.runId,
    env: workerEnv,
  });
  if (Result.isError(forkResult)) {
    return Result.err(new DispatchError({ message: forkResult.error.message }));
  }

  return Result.tryPromise({
    try: async () => {
      await startDetachedRunOnce(forkResult.value, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });

      console.log("[cloud-worker/dispatch] started forked sandbox run", {
        runId: input.runId,
        organizationId: input.organizationId,
        sandboxName,
        template_cache: input.templateCache,
        templateName: input.templateName,
      });

      return { sandboxName, templateCache: input.templateCache };
    },
    catch: (cause) =>
      new DispatchError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

async function startBundleSnapshotRun(input: {
  runId: string;
  organizationId: string;
  secret: string;
  snapshotId: string;
  templateCache: RepoTemplateCacheStatus | "fork_fallback";
  projectSourceControlConnectionId: string;
}): Promise<Result<DispatchCloudWorkflowRunSuccess, DispatchError>> {
  const snapshotResult = await createBundleSnapshotSandbox({
    bundleSnapshotId: input.snapshotId,
    runId: input.runId,
  });
  if (Result.isError(snapshotResult)) {
    return Result.err(new DispatchError({ message: snapshotResult.error.message }));
  }

  const sandboxName = runSandboxName(input.runId);
  const workerEnv = buildWorkerEnv({
    runId: input.runId,
    organizationId: input.organizationId,
    sandboxName,
    secret: input.secret,
  });

  return Result.tryPromise({
    try: async () => {
      await startDetachedRunOnce(snapshotResult.value, {
        runId: input.runId,
        organizationId: input.organizationId,
        workerEnv,
      });

      console.log("[cloud-worker/dispatch] started sandbox run", {
        runId: input.runId,
        organizationId: input.organizationId,
        sandboxName,
        projectSourceControlConnectionId: input.projectSourceControlConnectionId,
        template_cache: input.templateCache,
      });

      return { sandboxName, templateCache: input.templateCache };
    },
    catch: (cause) =>
      new DispatchError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export async function dispatchCloudWorkflowRun(
  db: Database,
  input: {
    runId: string;
    organizationId: string;
  },
): Promise<Result<DispatchCloudWorkflowRunSuccess, DispatchError>> {
  const snapshotId = env.cloudWorkerSnapshotId();
  const secret = env.cloudWorkerSecret();
  if (!snapshotId || !secret) {
    return Result.err(
      new DispatchError({ message: "Cloud worker snapshot or secret is not configured" }),
    );
  }

  const run = await getWorkflowRunExecutionForOrg(db, input.organizationId, input.runId);
  if (!run) {
    return Result.err(new DispatchError({ message: "Workflow run not found" }));
  }

  const projectSourceControlConnectionId = run.projectSourceControlConnectionId?.trim() ?? "";
  if (!projectSourceControlConnectionId) {
    return Result.err(
      new DispatchError({ message: "Missing project source control connection for cloud run" }),
    );
  }

  const namespace = run.namespace?.trim() ?? "";
  const repoName = run.repoName?.trim() ?? "";
  if (!namespace || !repoName) {
    return Result.err(new DispatchError({ message: "Missing repository coordinates for cloud run" }));
  }

  const provider = run.provider === "azure_devops" ? "azure_devops" : "github";

  let templateCache: RepoTemplateCacheStatus | "fork_fallback" = "fork_fallback";

  const templateResult = await ensureRepoTemplateSandbox({
    db,
    organizationId: input.organizationId,
    projectSourceControlConnectionId,
    provider,
    namespace,
    repoName,
    bundleSnapshotId: snapshotId,
  });

  if (Result.isOk(templateResult)) {
    const forked = await startForkedSandboxRun({
      runId: input.runId,
      organizationId: input.organizationId,
      secret,
      templateName: templateResult.value.templateName,
      templateCache: templateResult.value.cacheStatus,
    });
    if (Result.isOk(forked)) return forked;

    console.warn("[cloud-worker/dispatch] fork failed; falling back to bundle snapshot", {
      runId: input.runId,
      organizationId: input.organizationId,
      projectSourceControlConnectionId,
      templateName: templateResult.value.templateName,
      error: forked.error.message,
    });
    templateCache = "fork_fallback";
  } else {
    console.warn("[cloud-worker/dispatch] template setup failed; falling back to bundle snapshot", {
      runId: input.runId,
      organizationId: input.organizationId,
      projectSourceControlConnectionId,
      error: templateResult.error.message,
    });
  }

  const bundleResult = await startBundleSnapshotRun({
    runId: input.runId,
    organizationId: input.organizationId,
    secret,
    snapshotId,
    templateCache,
    projectSourceControlConnectionId,
  });
  if (Result.isError(bundleResult)) {
    console.error("[cloud-worker/dispatch] failed", input.runId, bundleResult.error.message);
  }
  return bundleResult;
}

export async function maybeDispatchCloudWorkflowRun(
  db: Database,
  input: { runId: string; organizationId: string },
): Promise<void> {
  if (!isSandboxDispatchEnabled()) {
    const reason = sandboxDispatchDisabledReason();
    if (reason) {
      console.warn("[cloud-worker/dispatch] sandbox dispatch disabled:", reason);
    }
    return;
  }

  const result = await dispatchCloudWorkflowRun(db, input);
  if (Result.isError(result)) {
    await updateWorkflowRunStatus(db, input.runId, input.organizationId, "failed", {
      errorMessage: `Cloud sandbox dispatch failed: ${result.error.message}`,
    });
  }
}
