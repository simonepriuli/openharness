import type { Database } from "@openharness/db";
import { env } from "../env.js";
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
import {
  SANDBOX_BUNDLE_ROOT,
  isSandboxDispatchEnabled,
  sandboxDispatchDisabledReason,
} from "./sandbox-dispatch-env.js";

export type DispatchCloudLinearAgentRunResult =
  | { ok: true; sandboxName: string; templateCache: RepoTemplateCacheStatus | "fork_fallback" }
  | { ok: false; error: string };

function sandboxWorkerId(runId: string): string {
  return `sandbox-agent-${runId}`;
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

async function startDetachedAgentRunOnce(
  sandbox: Awaited<ReturnType<typeof createBundleSnapshotSandbox>>,
  input: { runId: string; organizationId: string; workerEnv: Record<string, string> },
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

  const provider = run.provider === "azure_devops" ? "azure_devops" : "github";

  try {
    let sandbox: Awaited<ReturnType<typeof createBundleSnapshotSandbox>>;
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
        const sandboxName = runSandboxName(`agent-${input.runId}`);
        const workerEnv = buildWorkerEnv({
          runId: input.runId,
          organizationId: input.organizationId,
          sandboxName,
          secret,
        });
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
        return { ok: true, sandboxName, templateCache };
      } catch (forkErr) {
        console.warn("[cloud-worker/dispatch] linear agent fork failed; falling back", forkErr);
        templateCache = "fork_fallback";
      }
    }

    sandbox = await createBundleSnapshotSandbox({
      bundleSnapshotId: snapshotId,
      runId: `agent-${input.runId}`,
    });
    const sandboxName = runSandboxName(`agent-${input.runId}`);
    const workerEnv = buildWorkerEnv({
      runId: input.runId,
      organizationId: input.organizationId,
      sandboxName,
      secret,
    });
    await startDetachedAgentRunOnce(sandbox, {
      runId: input.runId,
      organizationId: input.organizationId,
      workerEnv,
    });
    return { ok: true, sandboxName, templateCache };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
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
