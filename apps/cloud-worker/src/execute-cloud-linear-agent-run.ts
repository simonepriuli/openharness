import { join } from "node:path";
import { Result } from "better-result";
import {
  claimLinearAgentRunInternal,
  cleanupRunWorktrees,
  createInternalLinearAgentRunApiClient,
  ensureRepoClone,
  executeLinearAgentRun,
  extractLinearAgentConfig,
  type PendingLinearAgentRun,
} from "@openharness/workflow-executor";
import { bestEffortAsync } from "./best-effort.js";
import type { CloudWorkerConfig } from "./config.js";
import { createCloudLinearAgentExecutorDeps } from "./executor-adapters-linear-agent.js";
import { cleanupCloudLinearAgentPiDir, resolveCloudOrgSecrets } from "./executor-adapters.js";
import {
  CloudRunFailedError,
  MissingConnectionError,
  type CloudRunError,
} from "./errors.js";
import { parseClaimConflict, wrapInfrastructureError } from "./result-helpers.js";

function resolveWorkspaceModeFromEnv(): "cold" | "create" | "reuse" | null {
  const mode = process.env.OPENHARNESS_WORKSPACE_MODE?.trim();
  if (mode === "create" || mode === "reuse" || mode === "cold") return mode;
  return null;
}

function resolveWorkspaceMode(
  run: PendingLinearAgentRun & { workspace?: { mode?: string } },
): "cold" | "create" | "reuse" {
  const envMode = resolveWorkspaceModeFromEnv();
  if (envMode) return envMode;
  const inferred = run.workspace?.mode;
  if (inferred === "create" || inferred === "reuse" || inferred === "cold") return inferred;
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

async function markAgentRunFailed(
  api: ReturnType<typeof createInternalLinearAgentRunApiClient>,
  runId: string,
  errorMessage: string,
): Promise<void> {
  await bestEffortAsync("mark linear agent run failed", () =>
    api.updateStatus(runId, "failed", { errorMessage }),
  );
}

async function cleanupLinearAgentArtifacts(options: {
  config: CloudWorkerConfig;
  runId: string;
  linearIssueId: string | null;
  worktreesRoot: string;
}): Promise<void> {
  await bestEffortAsync("linear agent worktree cleanup", () =>
    cleanupRunWorktrees(options.worktreesRoot),
  );
  cleanupCloudLinearAgentPiDir(options.config, options.runId, options.linearIssueId);
}

export async function pendingLinearAgentRunFromApi(
  config: CloudWorkerConfig,
  runId: string,
  organizationId: string,
): Promise<Result<PendingLinearAgentRun, import("./errors.js").CloudWorkerInfrastructureError>> {
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    workspaceMode: resolveWorkspaceModeFromEnv() ?? undefined,
  });

  return Result.tryPromise({
    try: async () => {
      const { run } = await api.getRun(runId);
      return { ...run, organizationId };
    },
    catch: (cause) => wrapInfrastructureError("fetch linear agent run", cause),
  });
}

export async function executeCloudLinearAgentRun(
  config: CloudWorkerConfig,
  run: PendingLinearAgentRun,
): Promise<Result<void, CloudRunError>> {
  const bootstrapApi = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
    sandboxName: config.sandboxName ?? undefined,
    workspaceMode: resolveWorkspaceModeFromEnv() ?? undefined,
  });

  const executionRunResult = await Result.tryPromise({
    try: () => bootstrapApi.getRun(run.id),
    catch: (cause) => wrapInfrastructureError("fetch linear agent run", cause),
  });
  if (Result.isError(executionRunResult)) {
    return executionRunResult;
  }

  const executionRun = executionRunResult.value.run;
  const workspaceMode = resolveWorkspaceMode(executionRun);
  const linearIssueId = resolveLinearIssueId(executionRun);
  const retainSandbox = workspaceMode === "create" || workspaceMode === "reuse";
  const worktreesRoot = issueScopedPathRoot(config.worktreesRoot, linearIssueId, run.id);
  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
    sandboxName: config.sandboxName ?? undefined,
    workspaceMode,
  });

  const result = await Result.gen(async function* () {
    yield* Result.await(
      Result.tryPromise({
        try: () =>
          claimLinearAgentRunInternal({
            baseUrl: config.apiUrl,
            secret: config.secret,
            runId: run.id,
            organizationId: run.organizationId,
            claimedBy: config.workerId,
            runnerInstanceId: config.workerId,
          }),
        catch: (cause) => {
          const conflict = parseClaimConflict(cause, run.id);
          return conflict ?? wrapInfrastructureError("claim linear agent run", cause);
        },
      }),
    );

    yield* Result.await(
      Result.tryPromise({
        try: () =>
          api.emitActivity(
            run.id,
            { type: "thought", body: "Claimed run, preparing repository…" },
            true,
          ),
        catch: (cause) => wrapInfrastructureError("emit linear agent activity", cause),
      }),
    );

    const connectionId = run.projectSourceControlConnectionId?.trim() ?? "";
    if (!connectionId) {
      const error = new MissingConnectionError({
        runId: run.id,
        context: "linear agent run",
      });
      await markAgentRunFailed(api, run.id, error.message);
      return Result.err(error);
    }

    const orgSecrets = yield* Result.await(resolveCloudOrgSecrets(config, run.organizationId));
    const provider = run.provider === "azure_devops" ? "azure_devops" : "github";

    const credentials = yield* Result.await(
      Result.tryPromise({
        try: () => api.fetchGitCredentials(provider, run.namespace, run.repoName),
        catch: (cause) => wrapInfrastructureError("fetch git credentials", cause),
      }),
    );

    yield* Result.await(
      Result.tryPromise({
        try: () =>
          api.emitActivity(run.id, {
            type: "action",
            action: "Preparing",
            parameter: "repository",
          }),
        catch: (cause) => wrapInfrastructureError("emit linear agent activity", cause),
      }),
    );

    const repoDir = yield* Result.await(
      Result.tryPromise({
        try: () =>
          ensureRepoClone({
            reposRoot: config.reposRoot,
            organizationId: run.organizationId,
            connectionId,
            credentials,
          }),
        catch: (cause) => wrapInfrastructureError("ensure repo clone", cause),
      }),
    );

    yield* Result.await(
      Result.tryPromise({
        try: () =>
          api.emitActivity(
            run.id,
            { type: "thought", body: "Repository ready, starting agent…" },
            true,
          ),
        catch: (cause) => wrapInfrastructureError("emit linear agent activity", cause),
      }),
    );

    const agentConfig = extractLinearAgentConfig(run);
    const deps = yield* Result.await(
      Result.tryPromise({
        try: () =>
          createCloudLinearAgentExecutorDeps({
            config,
            organizationId: run.organizationId,
            runId: run.id,
            linearIssueId,
            connectionId,
            orgSecrets,
            tools: agentConfig?.tools,
            workspaceMode,
          }),
        catch: (cause) => wrapInfrastructureError("create linear agent deps", cause),
      }),
    );

    const executeResult = await Result.tryPromise({
      try: () =>
        executeLinearAgentRun(run.id, deps, {
          projectPath: repoDir,
          worktreesRoot,
          piAgentDir: deps.piAgentDir,
        }),
      catch: (cause) => new CloudRunFailedError({ runId: run.id, cause }),
    });

    if (Result.isError(executeResult)) {
      await markAgentRunFailed(api, run.id, executeResult.error.message);
      if (!retainSandbox) {
        await cleanupLinearAgentArtifacts({
          config,
          runId: run.id,
          linearIssueId,
          worktreesRoot,
        });
      }
      return executeResult;
    }

    if (!retainSandbox) {
      await cleanupLinearAgentArtifacts({
        config,
        runId: run.id,
        linearIssueId,
        worktreesRoot,
      });
    }
    return Result.ok(undefined);
  });

  return result;
}

export function shouldRetainLinearAgentSandbox(): boolean {
  const mode = resolveWorkspaceModeFromEnv();
  return mode === "create" || mode === "reuse";
}
