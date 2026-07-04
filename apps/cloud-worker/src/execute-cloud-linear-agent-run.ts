import { join } from "node:path";
import {
  claimLinearAgentRunInternal,
  cleanupRunWorktrees,
  createInternalLinearAgentRunApiClient,
  ensureRepoClone,
  executeLinearAgentRun,
  extractLinearAgentConfig,
  type PendingLinearAgentRun,
} from "@openharness/workflow-executor";
import type { CloudWorkerConfig } from "./config.js";
import {
  createCloudLinearAgentExecutorDeps,
} from "./executor-adapters-linear-agent.js";
import { cleanupCloudPiAgentDir, resolveCloudOrgSecrets } from "./executor-adapters.js";

export function isAgentClaimConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("not available") || message.includes("(409)");
}

export type ExecuteCloudLinearAgentRunResult =
  | { ok: true }
  | { ok: false; reason: "claim_conflict" | "failed"; errorMessage?: string };

export async function pendingLinearAgentRunFromApi(
  config: CloudWorkerConfig,
  runId: string,
  organizationId: string,
): Promise<PendingLinearAgentRun> {
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
  });
  const { run } = await api.getRun(runId);
  return { ...run, organizationId };
}

export async function executeCloudLinearAgentRun(
  config: CloudWorkerConfig,
  run: PendingLinearAgentRun,
): Promise<ExecuteCloudLinearAgentRunResult> {
  const worktreesRoot = join(config.worktreesRoot, `agent-${run.id}`);
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
    sandboxName: config.sandboxName ?? undefined,
  });

  try {
    const claimed = await claimLinearAgentRunInternal({
      baseUrl: config.apiUrl,
      secret: config.secret,
      runId: run.id,
      organizationId: run.organizationId,
      claimedBy: config.workerId,
      runnerInstanceId: config.workerId,
    }).catch((err: unknown) => {
      if (isAgentClaimConflict(err)) return null;
      throw err;
    });
    if (!claimed) {
      return { ok: false, reason: "claim_conflict" };
    }

    const connectionId = run.projectSourceControlConnectionId?.trim() ?? "";
    if (!connectionId) {
      const message = "Missing project source control connection for linear agent run";
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

    const agentConfig = extractLinearAgentConfig(run);
    const deps = await createCloudLinearAgentExecutorDeps({
      config,
      organizationId: run.organizationId,
      runId: run.id,
      connectionId,
      orgSecrets,
      tools: agentConfig?.tools,
    });

    await executeLinearAgentRun(run.id, deps, {
      projectPath: repoDir,
      worktreesRoot,
    });

    await cleanupRunWorktrees(worktreesRoot);
    cleanupCloudPiAgentDir(config, run.id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await api.updateStatus(run.id, "failed", { errorMessage: message });
    } catch {
      // Best effort.
    }
    await cleanupRunWorktrees(worktreesRoot).catch(() => undefined);
    cleanupCloudPiAgentDir(config, run.id);
    return { ok: false, reason: "failed", errorMessage: message };
  }
}
