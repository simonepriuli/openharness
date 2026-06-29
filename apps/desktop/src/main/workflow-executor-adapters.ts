import type { BrowserWindow } from "electron";
import type { WorkflowExecutorDeps } from "@openharness/workflow-executor";
import {
  createBufferingWorkflowEventSink,
  createPiRunner,
  createSessionWorkflowRunApiClient,
  createWorkflowGitOps,
  runRepo,
} from "@openharness/workflow-executor";
import {
  buildGithubActionsEnv,
  enabledToolsFromWorkflowToggles,
} from "./github-actions-session.js";
import {
  buildWorkflowNotifyEnv,
  enabledNotifyToolsFromWorkflowToggles,
} from "./workflow-notify-session.js";
import {
  appendWorkflowRunEvents,
  fetchGitCredentials,
  fetchPrContext,
  fetchWorkflowRunForExecution,
  resolveRepoEnvironmentVariables,
  updateWorkflowRunStatus,
  type WorkflowRunExecutionRecord,
  type WorkflowTools,
} from "./openharness-api.js";
import { resolvePiSpawn } from "./pi-bin.js";
import { resolveWorkflowSummarizationModelRef } from "./pi-service.js";
import { appStore } from "./store.js";
import { getWorkflowWorktreesRoot } from "./workflow-git.js";

async function buildWorkflowGithubActionsEnv(
  run: WorkflowRunExecutionRecord,
  tools: WorkflowTools,
  prNumber?: number,
): Promise<NodeJS.ProcessEnv> {
  const repo = runRepo(run);
  if (repo.provider !== "github") return {};
  const enabledTools = enabledToolsFromWorkflowToggles(tools);
  if (enabledTools.length === 0) return {};
  return buildGithubActionsEnv({
    namespace: repo.namespace,
    repo: repo.repoName,
    prNumber,
    enabledTools,
  });
}

async function buildWorkflowNotifyEnvForRun(
  _run: WorkflowRunExecutionRecord,
  tools: WorkflowTools,
  runId: string,
): Promise<NodeJS.ProcessEnv> {
  const enabledTools = enabledNotifyToolsFromWorkflowToggles(tools);
  if (enabledTools.length === 0) return {};
  return buildWorkflowNotifyEnv({ runId, enabledTools });
}

export function createDesktopWorkflowExecutorDeps(options: {
  projectPath: string;
  window?: BrowserWindow | null;
  runId?: string;
  connectionId?: string;
}): WorkflowExecutorDeps {
  const runId = options.runId ?? "";
  const connectionId = options.connectionId?.trim() ?? "";

  return {
    api: createSessionWorkflowRunApiClient({
      getRunForExecution: fetchWorkflowRunForExecution,
      updateWorkflowRunStatus,
      fetchPrContext,
      fetchGitCredentials,
    }),
    git: createWorkflowGitOps(),
    pi: createPiRunner((rpcArgs) => resolvePiSpawn(rpcArgs)),
    events: createBufferingWorkflowEventSink({
      runId,
      onIpcEvent(event) {
        if (options.window && runId) {
          options.window.webContents.send("harness:event", {
            sessionKey: `workflow-run::${runId}`,
            event,
          });
        }
      },
      appendEvents: async (events) => {
        if (!runId || events.length === 0) return;
        await appendWorkflowRunEvents(runId, events);
      },
    }),
    secrets: {
      buildGithubActionsEnv: buildWorkflowGithubActionsEnv,
      buildWorkflowNotifyEnv: buildWorkflowNotifyEnvForRun,
      resolveSummarizationModelRef: () =>
        resolveWorkflowSummarizationModelRef(
          appStore.get("workflowSummarizationModel") ?? "",
          appStore.get("titleGenerationModel") ?? "",
        ),
      async buildPiProcessEnv() {
        if (!connectionId) return {};
        try {
          const { vars } = await resolveRepoEnvironmentVariables(connectionId);
          return { ...vars };
        } catch (err) {
          console.error("[workflow-executor] failed to resolve repo environment variables", err);
          return {};
        }
      },
    },
    worktreesRoot: getWorkflowWorktreesRoot(),
    projectPath: options.projectPath,
  };
}
