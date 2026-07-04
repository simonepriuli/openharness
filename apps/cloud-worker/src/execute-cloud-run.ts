import { join } from "node:path";
import { Result } from "better-result";
import {
  claimCloudWorkflowRunInternal,
  cleanupRunWorktrees,
  createInternalWorkflowRunApiClient,
  ensureRepoClone,
  executeWorkflowRun,
  MAX_WORKFLOW_ITERATIONS,
  type PendingCloudWorkflowRun,
} from "@openharness/workflow-executor";
import { bestEffortAsync } from "./best-effort.js";
import type { CloudWorkerConfig } from "./config.js";
import {
  CloudRunFailedError,
  IterationCapError,
  MissingConnectionError,
  type CloudRunError,
} from "./errors.js";
import {
  cleanupCloudPiAgentDir,
  createCloudWorkflowExecutorDeps,
  resolveCloudOrgSecrets,
} from "./executor-adapters.js";
import { parseClaimConflict, wrapInfrastructureError } from "./result-helpers.js";

async function markRunFailed(
  api: ReturnType<typeof createInternalWorkflowRunApiClient>,
  runId: string,
  errorMessage: string,
): Promise<void> {
  await bestEffortAsync("mark run failed", () =>
    api.updateStatus(runId, "failed", { errorMessage }),
  );
}

async function flushWorkflowEvents(
  flush: (() => Promise<void>) | undefined,
): Promise<void> {
  if (!flush) return;
  await bestEffortAsync("flush workflow events", flush);
}

export async function executeCloudRun(
  config: CloudWorkerConfig,
  run: PendingCloudWorkflowRun,
): Promise<Result<void, CloudRunError>> {
  const worktreesRoot = join(config.worktreesRoot, run.id);
  const api = createInternalWorkflowRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId: run.organizationId,
    sandboxName: config.sandboxName ?? undefined,
  });

  const result = await Result.gen(async function* () {
    yield* Result.await(
      Result.tryPromise({
        try: () =>
          claimCloudWorkflowRunInternal({
            baseUrl: config.apiUrl,
            secret: config.secret,
            runId: run.id,
            organizationId: run.organizationId,
            claimedBy: config.workerId,
            runnerInstanceId: config.workerId,
          }),
        catch: (cause) => {
          const conflict = parseClaimConflict(cause, run.id);
          return conflict ?? wrapInfrastructureError("claim run", cause);
        },
      }),
    );

    if (run.iteration > MAX_WORKFLOW_ITERATIONS) {
      const error = new IterationCapError({ runId: run.id, cap: MAX_WORKFLOW_ITERATIONS });
      await markRunFailed(api, run.id, error.message);
      return Result.err(error);
    }

    const connectionId = run.projectSourceControlConnectionId?.trim() ?? "";
    if (!connectionId) {
      const error = new MissingConnectionError({ runId: run.id, context: "cloud run" });
      await markRunFailed(api, run.id, error.message);
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

    const deps = yield* Result.await(
      Result.tryPromise({
        try: () =>
          createCloudWorkflowExecutorDeps({
            config,
            organizationId: run.organizationId,
            runId: run.id,
            connectionId,
            projectPath: repoDir,
            worktreesRoot,
            orgSecrets,
          }),
        catch: (cause) => wrapInfrastructureError("create executor deps", cause),
      }),
    );

    const executeResult = await Result.tryPromise({
      try: () => executeWorkflowRun(run.id, deps),
      catch: (cause) => new CloudRunFailedError({ runId: run.id, cause }),
    });
    await flushWorkflowEvents(deps.events.flush);

    if (Result.isError(executeResult)) {
      console.error("[cloud-worker] executeCloudRun error", run.id, executeResult.error.message);
      await markRunFailed(api, run.id, executeResult.error.message);
      return executeResult;
    }

    return Result.ok(undefined);
  });

  await bestEffortAsync("worktree cleanup", () => cleanupRunWorktrees(worktreesRoot));
  cleanupCloudPiAgentDir(config, run.id);
  return result;
}

export async function pendingRunFromApi(
  config: CloudWorkerConfig,
  runId: string,
  organizationId: string,
): Promise<Result<PendingCloudWorkflowRun, import("./errors.js").CloudWorkerInfrastructureError>> {
  const api = createInternalWorkflowRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
  });

  return Result.tryPromise({
    try: async () => {
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
        resolvedExecutor: "cloud" as const,
        createdAt: run.createdAt,
      };
    },
    catch: (cause) => wrapInfrastructureError("fetch pending run", cause),
  });
}
