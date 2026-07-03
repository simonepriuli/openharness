import { parseModelRef } from "@openharness/shared/workflow-run";
import type {
  WorkflowConfigSnapshot,
  WorkflowRunExecutionRecord,
  WorkflowRunResultPayload,
  WorkflowTools,
} from "@openharness/shared/workflow-run";
import { MAX_WORKFLOW_ITERATIONS } from "./constants.js";
import type { WorkflowExecutorDeps } from "./deps.js";
import { extractWorkflowConfig, runRepo } from "./helpers/run-repo.js";
import { DEFAULT_SCHEDULED_TOOLS, defaultToolsForEvent } from "./helpers/workflow-tools.js";
import { extractAssistantText } from "./pi/headless-pi.js";
import {
  buildBugTriageWorkflowPrompt,
  buildLinearWorkflowPrompt,
  buildScheduledWorkflowPrompt,
  buildWorkflowPrompt,
  filterPrContextForReview,
} from "./prompts/workflow-prompts.js";
import { extractResultPayload } from "./result/workflow-run-result.js";
import { summarizeWorkflowRun } from "./result/workflow-run-summarize.js";

async function buildPiEnvForRun(
  deps: WorkflowExecutorDeps,
  run: WorkflowRunExecutionRecord,
  runId: string,
  tools: WorkflowTools,
  worktreePath: string,
  prNumber?: number,
): Promise<NodeJS.ProcessEnv> {
  const [piProcessEnv, githubActionsEnv, notifyEnv, linearActionsEnv] = await Promise.all([
    deps.secrets.buildPiProcessEnv?.(worktreePath) ?? Promise.resolve({}),
    deps.secrets.buildGithubActionsEnv(run, tools, prNumber),
    deps.secrets.buildWorkflowNotifyEnv?.(run, tools, runId) ?? Promise.resolve({}),
    deps.secrets.buildLinearActionsEnv?.(run, tools, runId) ?? Promise.resolve({}),
  ]);
  return { ...piProcessEnv, ...githubActionsEnv, ...notifyEnv, ...linearActionsEnv };
}

async function buildRunResultFields(options: {
  assistantText: string | null;
  run: WorkflowRunExecutionRecord;
  workflowConfig: WorkflowConfigSnapshot | null;
  projectPath: string;
  deps: WorkflowExecutorDeps;
}): Promise<{
  resultMarkdown?: string;
  resultPayload?: WorkflowRunResultPayload | null;
}> {
  const assistantText = options.assistantText?.trim();
  if (!assistantText) return {};

  const workflowName = options.workflowConfig?.name ?? "Workflow";
  const modelRef = options.deps.secrets.resolveSummarizationModelRef();

  const resultPayload = extractResultPayload(
    assistantText,
    options.run.event,
    options.run.workflowType ?? null,
  );
  const resultMarkdown = await summarizeWorkflowRun({
    assistantText,
    workflowName,
    event: options.run.event,
    projectPath: options.projectPath,
    modelRef,
    pi: options.deps.pi,
  });

  return {
    ...(resultMarkdown ? { resultMarkdown } : {}),
    resultPayload,
  };
}

async function runPrWorkflow(
  run: WorkflowRunExecutionRecord,
  deps: WorkflowExecutorDeps,
  workflowConfig: WorkflowConfigSnapshot | null,
): Promise<string | null> {
  const repo = runRepo(run);
  const payload = run.payload as {
    pullRequest?: {
      headRef?: string;
      headSha?: string;
      baseRef?: string;
      title?: string;
    };
    review?: { id?: number | string; body?: string; state?: string };
  };

  const headRef = payload.pullRequest?.headRef;
  const headSha = payload.pullRequest?.headSha;
  if (!headRef || !headSha) {
    throw new Error("Missing PR head ref/sha in workflow payload");
  }

  const reviewId = payload.review?.id;
  const context = reviewId
    ? filterPrContextForReview(
        await deps.api.fetchPrContext(repo.provider, repo.namespace, repo.repoName, run.prNumber),
        reviewId,
      )
    : await deps.api.fetchPrContext(repo.provider, repo.namespace, repo.repoName, run.prNumber);

  const { worktreePath } = await deps.git.preparePrWorktree({
    repoCwd: deps.projectPath,
    worktreesRoot: deps.worktreesRoot,
    owner: repo.namespace,
    repo: repo.repoName,
    prNumber: run.prNumber,
    headRef,
    headSha,
    credentials: await deps.api.fetchGitCredentials(repo.provider, repo.namespace, repo.repoName),
  });

  const tools = workflowConfig?.tools ?? defaultToolsForEvent(run.event);
  const prompt = buildWorkflowPrompt(context, run, workflowConfig);
  const model = parseModelRef(workflowConfig?.model ?? "");
  const piEnv = await buildPiEnvForRun(deps, run, run.id, tools, worktreePath, run.prNumber);

  const piResult = await deps.pi.run({
    cwd: worktreePath,
    prompt,
    model,
    env: piEnv,
    onEvent: (event: unknown) => deps.events.append(event),
  });

  deps.events.setMessages?.(piResult.messages);
  return piResult.assistantText;
}

async function runLinearWorkflow(
  run: WorkflowRunExecutionRecord,
  deps: WorkflowExecutorDeps,
  workflowConfig: WorkflowConfigSnapshot | null,
): Promise<string> {
  const payload = run.payload as {
    branch?: string;
    linear?: Record<string, unknown>;
  };
  const resolvedBranch = payload.branch?.trim();
  if (!resolvedBranch) {
    throw new Error("Missing branch in Linear workflow payload");
  }

  const repo = runRepo(run);
  const creds = await deps.api.fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
  const { worktreePath } = await deps.git.prepareBranchWorktree({
    repoCwd: deps.projectPath,
    worktreesRoot: deps.worktreesRoot,
    owner: repo.namespace,
    repo: repo.repoName,
    branch: resolvedBranch,
    credentials: creds,
  });

  const prompt = buildLinearWorkflowPrompt(run, resolvedBranch, workflowConfig);
  const model = parseModelRef(workflowConfig?.model ?? "");
  const tools = workflowConfig?.tools ?? DEFAULT_SCHEDULED_TOOLS;
  const piEnv = await buildPiEnvForRun(deps, run, run.id, tools, worktreePath);

  const piResult = await deps.pi.run({
    cwd: worktreePath,
    prompt,
    model,
    env: piEnv,
    onEvent: (event: unknown) => deps.events.append(event),
  });

  deps.events.setMessages?.(piResult.messages);
  return piResult.assistantText;
}

async function runBugTriageWorkflow(
  run: WorkflowRunExecutionRecord,
  deps: WorkflowExecutorDeps,
  workflowConfig: WorkflowConfigSnapshot | null,
): Promise<string> {
  const payload = run.payload as {
    branch?: string;
    teams?: { teamsMessageText?: string };
    discord?: { discordMessageText?: string };
  };
  const resolvedBranch = payload.branch?.trim();
  if (!resolvedBranch) {
    throw new Error("Missing branch in bug triage workflow payload");
  }

  const repo = runRepo(run);
  const creds = await deps.api.fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
  const { worktreePath } = await deps.git.prepareBranchWorktree({
    repoCwd: deps.projectPath,
    worktreesRoot: deps.worktreesRoot,
    owner: repo.namespace,
    repo: repo.repoName,
    branch: resolvedBranch,
    credentials: creds,
  });

  const prompt = buildBugTriageWorkflowPrompt(run, resolvedBranch, workflowConfig);
  const model = parseModelRef(workflowConfig?.model ?? "");
  const tools = workflowConfig?.tools ?? DEFAULT_SCHEDULED_TOOLS;
  const piEnv = await buildPiEnvForRun(deps, run, run.id, tools, worktreePath);

  const piResult = await deps.pi.run({
    cwd: worktreePath,
    prompt,
    model,
    env: piEnv,
    onEvent: (event: unknown) => deps.events.append(event),
  });

  deps.events.setMessages?.(piResult.messages);
  return piResult.assistantText;
}

async function runScheduledWorkflow(
  run: WorkflowRunExecutionRecord,
  deps: WorkflowExecutorDeps,
  workflowConfig: WorkflowConfigSnapshot | null,
): Promise<string> {
  const payload = run.payload as { branch?: string };
  const branch = payload.branch?.trim();
  if (!branch) {
    throw new Error("Missing branch in scheduled workflow payload");
  }

  const repo = runRepo(run);
  const creds = await deps.api.fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
  const { worktreePath } = await deps.git.prepareBranchWorktree({
    repoCwd: deps.projectPath,
    worktreesRoot: deps.worktreesRoot,
    owner: repo.namespace,
    repo: repo.repoName,
    branch,
    credentials: creds,
  });

  const prompt = buildScheduledWorkflowPrompt(run, branch, workflowConfig);
  const model = parseModelRef(workflowConfig?.model ?? "");
  const tools = workflowConfig?.tools ?? DEFAULT_SCHEDULED_TOOLS;
  const piEnv = await buildPiEnvForRun(deps, run, run.id, tools, worktreePath);

  const piResult = await deps.pi.run({
    cwd: worktreePath,
    prompt,
    model,
    env: piEnv,
    onEvent: (event: unknown) => deps.events.append(event),
  });

  deps.events.setMessages?.(piResult.messages);
  return piResult.assistantText;
}

async function runWorkflowBody(
  run: WorkflowRunExecutionRecord,
  deps: WorkflowExecutorDeps,
  workflowConfig: WorkflowConfigSnapshot | null,
): Promise<string | null> {
  if (run.event === "teams_mention" || run.event === "discord_mention") {
    return runBugTriageWorkflow(run, deps, workflowConfig);
  }

  if (
    run.event === "linear_issue_created" ||
    run.event === "linear_issue_updated" ||
    run.event === "linear_comment_created"
  ) {
    return runLinearWorkflow(run, deps, workflowConfig);
  }

  if (run.event === "schedule" || run.event === "manual" || run.prNumber === 0) {
    return runScheduledWorkflow(run, deps, workflowConfig);
  }

  return runPrWorkflow(run, deps, workflowConfig);
}

export async function executeWorkflowRun(
  runId: string,
  deps: WorkflowExecutorDeps,
): Promise<void> {
  const { run, workflowConfig: embeddedConfig } = await deps.api.getRun(runId);
  const workflowConfig = embeddedConfig ?? extractWorkflowConfig(run);

  if (run.iteration > MAX_WORKFLOW_ITERATIONS) {
    await deps.api.updateStatus(runId, "failed", {
      errorMessage: `Iteration cap (${MAX_WORKFLOW_ITERATIONS}) reached`,
    });
    return;
  }

  if (!(await deps.git.isGitRepository(deps.projectPath))) {
    await deps.api.updateStatus(runId, "failed", {
      errorMessage: "Connected project folder is missing or not a git repository",
    });
    return;
  }

  await deps.api.updateStatus(runId, "running");

  try {
    const assistantText = await runWorkflowBody(run, deps, workflowConfig);
    const runResults = await buildRunResultFields({
      assistantText,
      run,
      workflowConfig,
      projectPath: deps.projectPath,
      deps,
    });
    await deps.api.updateStatus(runId, "done", {
      iteration: run.iteration,
      ...runResults,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const partialMessages = deps.events.snapshotMessages();
    const partialText = partialMessages.length ? extractAssistantText(partialMessages) : null;
    const runResults = partialText
      ? await buildRunResultFields({
          assistantText: partialText,
          run,
          workflowConfig,
          projectPath: deps.projectPath,
          deps,
        })
      : {};
    await deps.api.updateStatus(runId, "failed", {
      errorMessage: message,
      ...runResults,
    });
    throw err;
  }
}
