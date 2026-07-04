import { join } from "node:path";
import type { WorkflowTools } from "@openharness/shared/workflow-run";
import type { LinearAgentExecutorDeps } from "@openharness/workflow-executor";
import {
  appendInternalLinearAgentRunEvents,
  createBufferingWorkflowEventSink,
  createCloudGitOps,
  createPiRunner,
  ensureCloudPiAgentDir,
  resolveExaApiKeyFromOrgSecrets,
  type ResolvedOrgSecret,
} from "@openharness/workflow-executor";
import type { CloudWorkerConfig } from "./config.js";
import { buildLinearAgentActionsEnv } from "./linear-actions-env.js";
import { buildWorkflowGithubActionsEnv } from "./github-actions-env.js";
import { resolveCloudPiSpawn } from "./pi-runtime.js";
import { createInternalLinearAgentRunApiClient } from "@openharness/workflow-executor";
import type { LinearAgentRunExecutionRecord } from "@openharness/workflow-executor";

export async function createCloudLinearAgentExecutorDeps(options: {
  config: CloudWorkerConfig;
  organizationId: string;
  runId: string;
  connectionId: string;
  orgSecrets: ResolvedOrgSecret[];
  tools?: WorkflowTools;
}): Promise<LinearAgentExecutorDeps> {
  const { config, organizationId, runId, connectionId, orgSecrets, tools } = options;

  const piAgentDir = join(config.piAgentRoot, `agent-${runId}`, "agent");
  ensureCloudPiAgentDir({
    agentDir: piAgentDir,
    githubActionsExtensionDir: config.githubActionsExtensionDir,
    workflowNotifyExtensionDir: config.workflowNotifyExtensionDir,
    linearActionsExtensionDir: config.linearActionsExtensionDir,
    orgSecrets,
  });
  const exaApiKey = resolveExaApiKeyFromOrgSecrets(orgSecrets);

  const api = createInternalLinearAgentRunApiClient({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    sandboxName: config.sandboxName ?? undefined,
  });

  const defaultTools: WorkflowTools = tools ?? {
    prComment: false,
    prApprove: false,
    prPush: true,
    prCreate: true,
    teamsNotify: false,
    discordNotify: false,
    linearRead: true,
    linearWrite: true,
    linearComments: true,
  };

  return {
    api,
    git: createCloudGitOps({ worktreesRoot: join(config.worktreesRoot, `agent-${runId}`) }),
    pi: createPiRunner((rpcArgs) =>
      resolveCloudPiSpawn(config, rpcArgs, { piAgentDir, exaApiKey }),
    ),
    events: createBufferingWorkflowEventSink({
      runId,
      appendEvents: async (events) => {
        await appendInternalLinearAgentRunEvents({
          baseUrl: config.apiUrl,
          secret: config.secret,
          organizationId,
          runId,
          events,
        });
      },
    }),
    secrets: {
      buildGithubActionsEnv: async (run: LinearAgentRunExecutionRecord) => {
        const workflowLikeRun = {
          ...run,
          workflowId: null,
          workflowType: null,
          prNumber: 0,
          event: `linear_agent_${run.trigger}`,
          iteration: 1,
          githubOwner: run.namespace,
          githubRepo: run.repoName,
        };
        return buildWorkflowGithubActionsEnv(
          config,
          organizationId,
          workflowLikeRun as unknown as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord,
          defaultTools,
          0,
        );
      },
      buildLinearActionsEnv: async (
        _run: LinearAgentRunExecutionRecord,
        runTools: WorkflowTools | undefined,
        agentRunId: string,
      ) => buildLinearAgentActionsEnv(config, organizationId, runTools ?? defaultTools, agentRunId),
      resolveSummarizationModelRef: () => config.summarizationModelRef,
      async buildPiProcessEnv() {
        if (!connectionId) return {};
        return {};
      },
    },
  };
}
