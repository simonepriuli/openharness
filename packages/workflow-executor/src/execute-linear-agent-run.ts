import { parseModelRef, type WorkflowTools } from "@openharness/shared/workflow-run";
import type { LinearAgentExecutorDeps } from "./api/linear-agent-api-client.js";
import {
  extractLinearAgentConfig,
  linearAgentTargetBranch,
  type LinearAgentRunExecutionRecord,
} from "./linear-agent/linear-agent-run.js";
import { resolveLinearAgentPiPrompt } from "./prompts/linear-agent-prompts.js";
import { extractAssistantText, PROMPTED_AGENT_TIMEOUT_MS } from "./pi/headless-pi.js";
import { summarizeWorkflowRun } from "./result/workflow-run-summarize.js";

const DEFAULT_LINEAR_AGENT_TOOLS: WorkflowTools = {
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

const HEARTBEAT_INTERVAL_MS = 30_000;

async function buildPiEnvForAgentRun(
  deps: LinearAgentExecutorDeps,
  run: LinearAgentRunExecutionRecord,
  runId: string,
  tools: WorkflowTools,
  worktreePath: string,
): Promise<NodeJS.ProcessEnv> {
  const [piProcessEnv, githubActionsEnv, linearActionsEnv] = await Promise.all([
    deps.secrets.buildPiProcessEnv?.(worktreePath) ?? Promise.resolve({}),
    deps.secrets.buildGithubActionsEnv?.(run, tools) ?? Promise.resolve({}),
    deps.secrets.buildLinearActionsEnv?.(run, tools, runId) ?? Promise.resolve({}),
  ]);
  return { ...piProcessEnv, ...githubActionsEnv, ...linearActionsEnv };
}

export async function executeLinearAgentRun(
  runId: string,
  deps: LinearAgentExecutorDeps,
  options: {
    projectPath: string;
    worktreesRoot: string;
    piAgentDir?: string | null;
  },
): Promise<void> {
  const { run } = await deps.api.getRun(runId);
  const workspace = run.workspace;
  const config = extractLinearAgentConfig(run);
  const branch = linearAgentTargetBranch(run);
  const tools = config?.tools ?? DEFAULT_LINEAR_AGENT_TOOLS;

  await deps.api.updateStatus(runId, "running");

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  try {
    const credentials = await deps.api.fetchGitCredentials(
      run.provider,
      run.namespace,
      run.repoName,
    );

    const gitOptions = {
      repoCwd: options.projectPath,
      worktreesRoot: options.worktreesRoot,
      owner: run.namespace,
      repo: run.repoName,
      branch,
      credentials,
    };

    const worktreeResult =
      workspace?.mode === "reuse" &&
      workspace.worktreePath &&
      deps.git.resumeBranchWorktree
        ? await deps.git.resumeBranchWorktree({
            worktreePath: workspace.worktreePath,
            ...gitOptions,
          })
        : await deps.git.prepareBranchWorktree(gitOptions);

    const { worktreePath } = worktreeResult;
    const sessionMode =
      workspace?.mode === "reuse" && workspace.piSessionPath?.trim() ? "resume" : "new";
    const piSessionPath = workspace?.piSessionPath ?? null;

    const isPromptedFollowUp = run.trigger === "prompted";
    const prompt = resolveLinearAgentPiPrompt(run, branch, config, { sessionMode });
    const model = parseModelRef(config?.model ?? "");
    const piEnv = await buildPiEnvForAgentRun(deps, run, runId, tools, worktreePath);

    await deps.api.emitActivity(runId, { type: "action", action: "Running", parameter: "agent" });

    const startedAt = Date.now();
    heartbeatTimer = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      void deps.api.emitActivity(
        runId,
        { type: "thought", body: `Still working… (${elapsedSeconds}s elapsed)` },
        true,
      );
    }, HEARTBEAT_INTERVAL_MS);

    const piResult = await deps.pi.run({
      cwd: worktreePath,
      prompt,
      model,
      env: piEnv,
      sessionMode,
      piSessionPath,
      agentTimeoutMs: isPromptedFollowUp ? PROMPTED_AGENT_TIMEOUT_MS : undefined,
      onEvent: deps.events ? (event: unknown) => deps.events!.append(event) : undefined,
    });

    const assistantText = piResult.assistantText?.trim() ?? null;
    const modelRef = deps.secrets.resolveSummarizationModelRef?.() ?? "";
    const resultMarkdown = assistantText
      ? isPromptedFollowUp || !modelRef
        ? assistantText
        : await summarizeWorkflowRun({
            assistantText,
            workflowName: "Linear agent",
            event: `linear_agent_${run.trigger}`,
            projectPath: options.projectPath,
            modelRef,
            pi: deps.pi,
          })
      : undefined;

    await deps.api.updateStatus(runId, "done", {
      ...(resultMarkdown ? { resultMarkdown } : {}),
    });

    if (workspace?.retainSandbox) {
      await deps.api.completeRunWorkspace(runId, {
        worktreePath,
        workBranch: worktreeResult.branchName,
        piAgentDir: options.piAgentDir ?? null,
        piSessionPath: piResult.piSessionPath ?? piSessionPath,
        success: true,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.api.updateStatus(runId, "failed", { errorMessage: message });
    if (workspace?.retainSandbox) {
      try {
        await deps.api.completeRunWorkspace(runId, { success: false });
      } catch {
        // Best effort.
      }
    }
    throw err;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await deps.events?.flush?.();
  }
}

export { extractAssistantText };
