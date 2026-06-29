import type { Database } from "@openharness/db";
import type { Sandbox } from "@vercel/sandbox";
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

export type DispatchCloudWorkflowRunResult =
  | { ok: true; sandboxName: string; templateCache: RepoTemplateCacheStatus | "fork_fallback" }
  | { ok: false; error: string };

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

export async function dispatchCloudWorkflowRun(
  db: Database,
  input: {
    runId: string;
    organizationId: string;
  },
): Promise<DispatchCloudWorkflowRunResult> {
  const snapshotId = env.cloudWorkerSnapshotId();
  const secret = env.cloudWorkerSecret();
  if (!snapshotId || !secret) {
    return { ok: false, error: "Cloud worker snapshot or secret is not configured" };
  }

  const run = await getWorkflowRunExecutionForOrg(db, input.organizationId, input.runId);
  if (!run) {
    return { ok: false, error: "Workflow run not found" };
  }

  const projectSourceControlConnectionId = run.projectSourceControlConnectionId?.trim() ?? "";
  if (!projectSourceControlConnectionId) {
    return { ok: false, error: "Missing project source control connection for cloud run" };
  }

  const namespace = run.namespace?.trim() ?? "";
  const repoName = run.repoName?.trim() ?? "";
  if (!namespace || !repoName) {
    return { ok: false, error: "Missing repository coordinates for cloud run" };
  }

  const provider = run.provider === "azure_devops" ? "azure_devops" : "github";

  try {
    let sandbox: Sandbox;
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

    if (templateResult.ok) {
      templateCache = templateResult.cacheStatus;
      try {
        const sandboxName = runSandboxName(input.runId);
        const workerEnv = buildWorkerEnv({
          runId: input.runId,
          organizationId: input.organizationId,
          sandboxName,
          secret,
        });
        sandbox = await forkRunSandbox({
          templateName: templateResult.templateName,
          runId: input.runId,
          env: workerEnv,
        });
        await startDetachedRunOnce(sandbox, {
          runId: input.runId,
          organizationId: input.organizationId,
          workerEnv,
        });

        console.log("[cloud-worker/dispatch] started forked sandbox run", {
          runId: input.runId,
          organizationId: input.organizationId,
          sandboxName,
          projectSourceControlConnectionId,
          template_cache: templateCache,
          templateName: templateResult.templateName,
        });

        return { ok: true, sandboxName, templateCache };
      } catch (forkErr) {
        const message = forkErr instanceof Error ? forkErr.message : String(forkErr);
        console.warn("[cloud-worker/dispatch] fork failed; falling back to bundle snapshot", {
          runId: input.runId,
          organizationId: input.organizationId,
          projectSourceControlConnectionId,
          templateName: templateResult.templateName,
          error: message,
        });
        templateCache = "fork_fallback";
      }
    } else {
      console.warn("[cloud-worker/dispatch] template setup failed; falling back to bundle snapshot", {
        runId: input.runId,
        organizationId: input.organizationId,
        projectSourceControlConnectionId,
        error: templateResult.error,
      });
    }

    sandbox = await createBundleSnapshotSandbox({
      bundleSnapshotId: snapshotId,
      runId: input.runId,
    });
    const sandboxName = runSandboxName(input.runId);
    const workerEnv = buildWorkerEnv({
      runId: input.runId,
      organizationId: input.organizationId,
      sandboxName,
      secret,
    });

    await startDetachedRunOnce(sandbox, {
      runId: input.runId,
      organizationId: input.organizationId,
      workerEnv,
    });

    console.log("[cloud-worker/dispatch] started sandbox run", {
      runId: input.runId,
      organizationId: input.organizationId,
      sandboxName,
      projectSourceControlConnectionId,
      template_cache: templateCache,
    });

    return { ok: true, sandboxName, templateCache };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloud-worker/dispatch] failed", input.runId, message);
    return { ok: false, error: message };
  }
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
  if (!result.ok) {
    await updateWorkflowRunStatus(db, input.runId, input.organizationId, "failed", {
      errorMessage: `Cloud sandbox dispatch failed: ${result.error}`,
    });
  }
}
