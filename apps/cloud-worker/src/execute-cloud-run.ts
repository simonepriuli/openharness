import { join } from "node:path";
import {
  claimCloudWorkflowRunInternal,
  cleanupRunWorktrees,
  createInternalWorkflowRunApiClient,
  ensureRepoClone,
  executeWorkflowRun,
  MAX_WORKFLOW_ITERATIONS,
  type PendingCloudWorkflowRun,
} from "@openharness/workflow-executor";
import type { CloudWorkerConfig } from "./config.js";
import {
  cleanupCloudPiAgentDir,
  createCloudWorkflowExecutorDeps,
  resolveCloudOrgSecrets,
} from "./executor-adapters.js";

export function isClaimConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("not available") || message.includes("(409)");
}

export type ExecuteCloudRunResult =
  | { ok: true }
  | { ok: false; reason: "claim_conflict" | "failed"; errorMessage?: string };

export async function executeCloudRun(
  config: CloudWorkerConfig,
  run: PendingCloudWorkflowRun,
): Promise<ExecuteCloudRunResult> {
  const worktreesRoot = join(config.worktreesRoot, run.id);
  const api = createInternalWorkflowRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
  });

  try {
    const claimed = await claimCloudWorkflowRunInternal({
      baseUrl: config.apiUrl,
      secret: config.secret,
      runId: run.id,
      organizationId: run.organizationId,
      claimedBy: config.workerId,
      runnerInstanceId: config.workerId,
    }).catch((err: unknown) => {
      if (isClaimConflict(err)) return null;
      throw err;
    });
    if (!claimed) {
      return { ok: false, reason: "claim_conflict" };
    }

    if (run.iteration > MAX_WORKFLOW_ITERATIONS) {
      const message = `Iteration cap (${MAX_WORKFLOW_ITERATIONS}) reached`;
      await api.updateStatus(run.id, "failed", { errorMessage: message });
      return { ok: false, reason: "failed", errorMessage: message };
    }

    const connectionId = run.projectSourceControlConnectionId?.trim() ?? "";
    if (!connectionId) {
      const message = "Missing project source control connection for cloud run";
      await api.updateStatus(run.id, "failed", { errorMessage: message });
      return { ok: false, reason: "failed", errorMessage: message };
    }

    const orgSecrets = await resolveCloudOrgSecrets(config, run.organizationId);
    const provider = run.provider === "azure_devops" ? "azure_devops" : "github";
    const credentials = await api.fetchGitCredentials(provider, run.namespace, run.repoName);

    const repoDir = await ensureRepoClone({
      reposRoot: config.reposRoot,
      organizationId: run.organizationId,
      connectionId,
      credentials,
    });

    const deps = await createCloudWorkflowExecutorDeps({
      config,
      organizationId: run.organizationId,
      runId: run.id,
      connectionId,
      projectPath: repoDir,
      worktreesRoot,
      orgSecrets,
    });

    try {
      await executeWorkflowRun(run.id, deps);
    } finally {
      await deps.events.flush?.();
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloud-worker] executeCloudRun error", run.id, message);
    try {
      await api.updateStatus(run.id, "failed", { errorMessage: message });
    } catch (statusErr) {
      console.error("[cloud-worker] failed to mark run failed", run.id, statusErr);
    }
    return { ok: false, reason: "failed", errorMessage: message };
  } finally {
    await cleanupRunWorktrees(worktreesRoot).catch((cleanupErr) => {
      console.warn("[cloud-worker] worktree cleanup failed", run.id, cleanupErr);
    });
    cleanupCloudPiAgentDir(config, run.id);
  }
}

export async function pendingRunFromApi(
  config: CloudWorkerConfig,
  runId: string,
  organizationId: string,
): Promise<PendingCloudWorkflowRun> {
  const api = createInternalWorkflowRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
  });
  const { run } = await api.getRun(runId);
  return {
    id: run.id,
    organizationId,
    workflowId: run.workflowId,
    workflowType: run.workflowType ?? null,
    projectSourceControlConnectionId: run.projectSourceControlConnectionId ?? null,
    provider: run.provider ?? "github",
    namespace: run.namespace ?? run.githubOwner,
    repoName: run.repoName ?? run.githubRepo,
    prNumber: run.prNumber,
    event: run.event,
    iteration: run.iteration,
    payload: run.payload,
    resolvedExecutor: "cloud",
    createdAt: run.createdAt,
  };
}
