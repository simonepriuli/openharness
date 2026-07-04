import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Result } from "better-result";
import type { WorkflowExecutorDeps } from "@openharness/workflow-executor";
import {
  appendInternalWorkflowRunEvents,
  createBufferingWorkflowEventSink,
  createCloudGitOps,
  createInternalWorkflowRunApiClient,
  createPiRunner,
  ensureCloudPiAgentDir,
  resolveExaApiKeyFromOrgSecrets,
  resolveOrgSecretsInternal,
  resolveRepoEnvironmentVariables,
  type ResolvedOrgSecret,
} from "@openharness/workflow-executor";
import type { CloudWorkerConfig } from "./config.js";
import { CloudWorkerInfrastructureError } from "./errors.js";
import { buildWorkflowGithubActionsEnv } from "./github-actions-env.js";
import { buildWorkflowLinearActionsEnv } from "./linear-actions-env.js";
import { buildWorkflowNotifyEnv } from "./workflow-notify-env.js";
import { resolveCloudPiSpawn } from "./pi-runtime.js";
import { wrapInfrastructureError } from "./result-helpers.js";

export async function createCloudWorkflowExecutorDeps(options: {
  config: CloudWorkerConfig;
  organizationId: string;
  runId: string;
  connectionId: string;
  projectPath: string;
  worktreesRoot: string;
  orgSecrets: ResolvedOrgSecret[];
}): Promise<WorkflowExecutorDeps> {
  const { config, organizationId, runId, connectionId, projectPath, worktreesRoot, orgSecrets } =
    options;

  const piAgentDir = join(config.piAgentRoot, runId, "agent");
  mkdirSync(piAgentDir, { recursive: true });
  ensureCloudPiAgentDir({
    agentDir: piAgentDir,
    githubActionsExtensionDir: config.githubActionsExtensionDir,
    workflowNotifyExtensionDir: config.workflowNotifyExtensionDir,
    linearActionsExtensionDir: config.linearActionsExtensionDir,
    orgSecrets,
  });
  const exaApiKey = resolveExaApiKeyFromOrgSecrets(orgSecrets);

  const api = createInternalWorkflowRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    sandboxName: config.sandboxName ?? undefined,
  });

  return {
    api,
    git: createCloudGitOps({ worktreesRoot }),
    pi: createPiRunner((rpcArgs) =>
      resolveCloudPiSpawn(config, rpcArgs, { piAgentDir, exaApiKey }),
    ),
    events: createBufferingWorkflowEventSink({
      runId,
      appendEvents: async (events) => {
        await appendInternalWorkflowRunEvents({
          baseUrl: config.apiUrl,
          secret: config.secret,
          organizationId,
          runId,
          events,
        });
      },
    }),
    secrets: {
      buildGithubActionsEnv: (run, tools, prNumber) =>
        buildWorkflowGithubActionsEnv(config, organizationId, run, tools, prNumber),
      buildWorkflowNotifyEnv: (run, tools, notifyRunId) =>
        buildWorkflowNotifyEnv(config, organizationId, run, tools, notifyRunId),
      buildLinearActionsEnv: (run, tools, linearRunId) =>
        buildWorkflowLinearActionsEnv(config, organizationId, run, tools, linearRunId),
      resolveSummarizationModelRef: () => config.summarizationModelRef,
      async buildPiProcessEnv() {
        if (!connectionId) return {};
        const result = await Result.tryPromise({
          try: () =>
            resolveRepoEnvironmentVariables({
              baseUrl: config.apiUrl,
              secret: config.secret,
              organizationId,
              connectionId,
            }),
          catch: (cause) => wrapInfrastructureError("resolve repo environment variables", cause),
        });
        return result.match({
          ok: (env) => env,
          err: (error) => {
            console.error("[cloud-worker] failed to resolve repo environment variables", error);
            return {};
          },
        });
      },
    },
    worktreesRoot,
    projectPath,
  };
}

export async function resolveCloudOrgSecrets(
  config: CloudWorkerConfig,
  organizationId: string,
): Promise<Result<ResolvedOrgSecret[], CloudWorkerInfrastructureError>> {
  return Result.tryPromise({
    try: () =>
      resolveOrgSecretsInternal({
        baseUrl: config.apiUrl,
        secret: config.secret,
        organizationId,
      }),
    catch: (cause) => wrapInfrastructureError("resolve org secrets", cause),
  });
}

export function cleanupCloudPiAgentDir(config: CloudWorkerConfig, runId: string): void {
  const dir = join(config.piAgentRoot, runId);
  Result.try({
    try: () => {
      rmSync(dir, { recursive: true, force: true });
    },
    catch: () => undefined,
  });
}

export function cleanupCloudLinearAgentPiDir(
  config: CloudWorkerConfig,
  runId: string,
  linearIssueId: string | null,
): void {
  if (linearIssueId) {
    return;
  }
  const dir = join(config.piAgentRoot, `agent-${runId}`);
  Result.try({
    try: () => {
      rmSync(dir, { recursive: true, force: true });
    },
    catch: () => undefined,
  });
}
