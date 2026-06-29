import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
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
import { buildWorkflowGithubActionsEnv } from "./github-actions-env.js";
import { buildWorkflowNotifyEnv } from "./workflow-notify-env.js";
import { resolveCloudPiSpawn } from "./pi-runtime.js";

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
      buildWorkflowNotifyEnv: (run, tools, runId) =>
        buildWorkflowNotifyEnv(config, organizationId, run, tools, runId),
      resolveSummarizationModelRef: () => config.summarizationModelRef,
      async buildPiProcessEnv() {
        if (!connectionId) return {};
        try {
          return await resolveRepoEnvironmentVariables({
            baseUrl: config.apiUrl,
            secret: config.secret,
            organizationId,
            connectionId,
          });
        } catch (err) {
          console.error("[cloud-worker] failed to resolve repo environment variables", err);
          return {};
        }
      },
    },
    worktreesRoot,
    projectPath,
  };
}

export async function resolveCloudOrgSecrets(
  config: CloudWorkerConfig,
  organizationId: string,
): Promise<ResolvedOrgSecret[]> {
  return resolveOrgSecretsInternal({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
  });
}

export function cleanupCloudPiAgentDir(config: CloudWorkerConfig, runId: string): void {
  const dir = join(config.piAgentRoot, runId);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}
