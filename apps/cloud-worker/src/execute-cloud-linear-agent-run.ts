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
import { createCloudLinearAgentExecutorDeps } from "./executor-adapters-linear-agent.js";
import { cleanupCloudLinearAgentPiDir, resolveCloudOrgSecrets } from "./executor-adapters.js";

export function isAgentClaimConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("not available") || message.includes("(409)");
}

export type ExecuteCloudLinearAgentRunResult =
  | { ok: true }
  | { ok: false; reason: "claim_conflict" | "failed"; errorMessage?: string };

function resolveWorkspaceMode(): "cold" | "create" | "reuse" {
  const mode = process.env.OPENHARNESS_WORKSPACE_MODE?.trim();
  if (mode === "create" || mode === "reuse" || mode === "cold") return mode;
  return "cold";
}

function resolveLinearIssueId(run: PendingLinearAgentRun): string | null {
  const fromEnv = process.env.OPENHARNESS_LINEAR_ISSUE_ID?.trim();
  if (fromEnv) return fromEnv;
  return run.linearIssueId?.trim() || null;
}

function issueScopedPathRoot(root: string, linearIssueId: string | null, runId: string): string {
  if (linearIssueId) {
    return join(root, `issue-${linearIssueId}`);
  }
  return join(root, `agent-${runId}`);
}

export async function pendingLinearAgentRunFromApi(
  config: CloudWorkerConfig,
  runId: string,
  organizationId: string,
): Promise<PendingLinearAgentRun> {
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    workspaceMode: resolveWorkspaceMode(),
  });
  const { run } = await api.getRun(runId);
  return { ...run, organizationId };
}

export async function executeCloudLinearAgentRun(
  config: CloudWorkerConfig,
  run: PendingLinearAgentRun,
): Promise<ExecuteCloudLinearAgentRunResult> {
  const workspaceMode = resolveWorkspaceMode();
  const linearIssueId = resolveLinearIssueId(run);
  const retainSandbox = workspaceMode === "create" || workspaceMode === "reuse";
  const worktreesRoot = issueScopedPathRoot(config.worktreesRoot, linearIssueId, run.id);
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
    sandboxName: config.sandboxName ?? undefined,
    workspaceMode,
  });

  let piAgentDir: string | null = null;

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

    await api.emitActivity(
      run.id,
      { type: "thought", body: "Claimed run, preparing repository…" },
      true,
    );

    const connectionId = run.projectSourceControlConnectionId?.trim() ?? "";
    if (!connectionId) {
      const message = "Missing project source control connection for linear agent run";
      await api.updateStatus(run.id, "failed", { errorMessage: message });
      return { ok: false, reason: "failed", errorMessage: message };
    }

    const orgSecrets = await resolveCloudOrgSecrets(config, run.organizationId);
    const provider = run.provider === "azure_devops" ? "azure_devops" : "github";
    const credentials = await api.fetchGitCredentials(provider, run.namespace, run.repoName);

    await api.emitActivity(run.id, {
      type: "action",
      action: "Preparing",
      parameter: "repository",
    });

    const repoDir = await ensureRepoClone({
      reposRoot: config.reposRoot,
      organizationId: run.organizationId,
      connectionId,
      credentials,
    });

    await api.emitActivity(
      run.id,
      { type: "thought", body: "Repository ready, starting agent…" },
      true,
    );

    const agentConfig = extractLinearAgentConfig(run);
    const deps = await createCloudLinearAgentExecutorDeps({
      config,
      organizationId: run.organizationId,
      runId: run.id,
      linearIssueId,
      connectionId,
      orgSecrets,
      tools: agentConfig?.tools,
      workspaceMode,
    });
    piAgentDir = deps.piAgentDir;

    await executeLinearAgentRun(run.id, deps, {
      projectPath: repoDir,
      worktreesRoot,
      piAgentDir,
    });

    if (!retainSandbox) {
      await cleanupRunWorktrees(worktreesRoot);
      cleanupCloudLinearAgentPiDir(config, run.id, linearIssueId);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await api.updateStatus(run.id, "failed", { errorMessage: message });
    } catch {
      // Best effort.
    }
    if (!retainSandbox) {
      await cleanupRunWorktrees(worktreesRoot).catch(() => undefined);
      cleanupCloudLinearAgentPiDir(config, run.id, linearIssueId);
    }
    return { ok: false, reason: "failed", errorMessage: message };
  }
}

export function shouldRetainLinearAgentSandbox(): boolean {
  const mode = resolveWorkspaceMode();
  return mode === "create" || mode === "reuse";
}
