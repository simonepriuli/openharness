import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import {
  claimWorkflowRun,
  fetchActiveWorkflowRunsForRunner,
  fetchGitCredentials,
  fetchPendingWorkflowRuns,
  fetchPrContext,
  listOrgGithubConnections,
  OpenHarnessApiError,
  updateWorkflowRunStatus,
  upsertRunnerBinding,
  type PrContext,
  type SourceControlProviderId,
  type WorkflowConfigSnapshot,
  type WorkflowRunPayload,
  type WorkflowTools,
} from "./openharness-api.js";
import { getGitRemoteInfo } from "./git-remote.js";
import {
  buildGithubActionsEnv,
  enabledToolsFromWorkflowToggles,
} from "./github-actions-session.js";
import { resolveWorkflowSummarizationModelRef } from "./pi-service.js";
import { getWorkflowRunnerInstanceId } from "./runner-instance.js";
import { appStore } from "./store.js";
import { extractResultPayload } from "./workflow-run-result.js";
import { summarizeWorkflowRun } from "./workflow-run-summarize.js";
import {
  getWorkflowWorktreesRoot,
  isGitRepository,
  preparePrWorktree,
  prepareBranchWorktree,
} from "./workflow-git.js";
import { extractAssistantText, runHeadlessPiPrompt } from "./workflow-pi.js";
import { expandPromptTools } from "./thread-tools.js";
import { extractToolInvocationsFromText } from "../shared/thread-tools.js";

const MAX_WORKFLOW_ITERATIONS = 5;
const POLL_INTERVAL_MS = 5_000;
const AUTH_POLL_BACKOFF_MS = 15_000;
const STALE_RUN_ERROR_MESSAGE =
  "Run interrupted — the workflow runner restarted or exited before completion";

const DEFAULT_SCHEDULED_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  prCreate: false,
  teamsNotify: false,
  discordNotify: false,
};

type WorkflowRunEvent = WorkflowRunPayload & { id: string };

async function buildRunResultFields(options: {
  assistantText: string | null;
  run: WorkflowRunEvent;
  workflowConfig: WorkflowConfigSnapshot | null;
  projectPath: string;
}): Promise<{
  resultMarkdown?: string;
  resultPayload?: import("./openharness-api.js").WorkflowRunResultPayload | null;
}> {
  const assistantText = options.assistantText?.trim();
  if (!assistantText) return {};

  const workflowName = options.workflowConfig?.name ?? "Workflow";
  const modelRef = resolveWorkflowSummarizationModelRef(
    appStore.get("workflowSummarizationModel") ?? "",
    appStore.get("titleGenerationModel") ?? "",
  );

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
  });

  return {
    ...(resultMarkdown ? { resultMarkdown } : {}),
    resultPayload,
  };
}

type WorkflowRunUpdateNotification = {
  runId: string;
  workflowId: string | null;
  title: string;
  messages: unknown[];
  streaming: boolean;
};

export class WorkflowRunner {
  private window: BrowserWindow | null = null;
  private abortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private pollBackoffUntil = 0;
  private processing = false;
  private queue: WorkflowRunEvent[] = [];
  private executingRunId: string | null = null;
  private rendererReady = false;
  private activeRuns = new Map<string, WorkflowRunUpdateNotification>();
  private activityChangeListener: (() => void) | null = null;

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  setRendererReady(ready: boolean): void {
    this.rendererReady = ready;
    if (ready) {
      this.syncRunsToRenderer();
    }
  }

  setActivityChangeListener(listener: (() => void) | null): void {
    this.activityChangeListener = listener;
  }

  isBusy(): boolean {
    return this.executingRunId !== null || this.queue.length > 0 || this.processing;
  }

  private notifyActivityChange(): void {
    this.activityChangeListener?.();
  }

  start(): void {
    if (this.abortController) return;
    this.abortController = new AbortController();
    void this.initializeBindings();
    void this.reconcileStaleRuns();
    void this.pollPendingRuns();
    this.pollTimer = setInterval(() => void this.pollPendingRuns(), POLL_INTERVAL_MS);
  }

  async reconcileStaleRuns(): Promise<number> {
    if (!this.abortController) return 0;

    const instanceId = this.getInstanceId();
    let reconciled = 0;

    try {
      const { runs } = await fetchActiveWorkflowRunsForRunner(instanceId);
      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queuedRun) => queuedRun.id === run.id)) continue;

        await updateWorkflowRunStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        });
        this.activeRuns.delete(run.id);
        reconciled += 1;
        console.warn("[workflow-runner] reconciled stale run", run.id, run.status);
      }
      if (reconciled > 0) {
        this.notifyActivityChange();
      }
    } catch (err) {
      if (this.abortController?.signal.aborted) return reconciled;
      if (err instanceof OpenHarnessApiError && err.status === 401) return reconciled;
      console.error("[workflow-runner] stale run reconciliation failed", err);
    }

    return reconciled;
  }

  private async initializeBindings(): Promise<void> {
    try {
      await this.autoBackfillBindings(this.getInstanceId());
    } catch (err) {
      console.error("[workflow-runner] failed to initialize bindings", err);
    }
  }

  private async autoBackfillBindings(instanceId: string): Promise<void> {
    const { connections } = await listOrgGithubConnections();
    if (connections.length === 0) return;

    const recent = appStore.get("recentProjectCwds") ?? [];
    const lastCwd = appStore.get("lastCwd");
    const paths = [...new Set([...recent, lastCwd].filter((value): value is string => Boolean(value)))];

    for (const projectPath of paths) {
      if (!existsSync(projectPath) || !(await isGitRepository(projectPath))) continue;
      const remote = await getGitRemoteInfo(projectPath);
      if (!remote.namespace || !remote.repo || !remote.provider) continue;

      const connection = connections.find(
        (row) =>
          (row.provider ?? "github") === remote.provider &&
          row.githubOwner.toLowerCase() === remote.namespace!.toLowerCase() &&
          row.githubRepo.toLowerCase() === remote.repo!.toLowerCase(),
      );
      if (!connection) continue;

      await upsertRunnerBinding({
        runnerInstanceId: instanceId,
        connectionId: connection.id,
        projectPath,
      });
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }

  private getInstanceId(): string {
    return getWorkflowRunnerInstanceId();
  }

  private getWorktreesRoot(): string {
    return getWorkflowWorktreesRoot();
  }

  private async pollPendingRuns(): Promise<void> {
    if (!this.abortController || this.polling) return;
    if (Date.now() < this.pollBackoffUntil) return;

    this.polling = true;
    try {
      await this.reconcileStaleRuns();
      const { runs } = await fetchPendingWorkflowRuns(this.getInstanceId());
      let queued = false;
      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queuedRun) => queuedRun.id === run.id)) continue;
        this.queue.push(run);
        queued = true;
      }
      if (queued) {
        this.notifyActivityChange();
      }
      void this.processQueue();
    } catch (err) {
      if (this.abortController?.signal.aborted) return;
      if (err instanceof OpenHarnessApiError && err.status === 401) {
        console.warn("[workflow-runner] poll unauthorized, backing off");
        this.pollBackoffUntil = Date.now() + AUTH_POLL_BACKOFF_MS;
        return;
      }
      console.error("[workflow-runner] poll error", err);
    } finally {
      this.polling = false;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const run = this.queue.shift();
      if (!run) continue;
      try {
        await this.executeRun(run);
      } catch (err) {
        console.error("[workflow-runner] run failed", run.id, err);
      }
    }

    this.processing = false;
    this.notifyActivityChange();
  }

  private async executeRun(run: WorkflowRunEvent): Promise<void> {
    this.executingRunId = run.id;
    this.notifyActivityChange();
    try {
      const instanceId = this.getInstanceId();
      const claimed = await claimWorkflowRun(run.id, instanceId, instanceId).catch((err) => {
        if (err instanceof OpenHarnessApiError && err.status === 409) return null;
        throw err;
      });
      if (!claimed) return;

      const claimedRun = claimed.run as { projectPath?: string | null };
      const projectPath = claimedRun.projectPath ?? run.projectPath;
      if (!projectPath || !existsSync(projectPath) || !(await isGitRepository(projectPath))) {
        await updateWorkflowRunStatus(run.id, "failed", {
          errorMessage: "Connected project folder is missing or not a git repository",
        });
        return;
      }

      if (run.iteration > MAX_WORKFLOW_ITERATIONS) {
        await updateWorkflowRunStatus(run.id, "failed", {
          errorMessage: `Iteration cap (${MAX_WORKFLOW_ITERATIONS}) reached`,
        });
        return;
      }

      const workflowConfig = extractWorkflowConfig(run);
      const runId = run.id;
      const title =
        workflowConfig?.name ??
        (run.event === "teams_mention"
          ? "Teams bug triage"
          : run.event === "discord_mention"
            ? "Discord bug triage"
          : run.event === "schedule"
            ? "Scheduled workflow"
            : run.prNumber > 0
              ? `PR #${run.prNumber}`
              : "Workflow");

      this.notifyRunUpdate({
        runId,
        workflowId: run.workflowId ?? workflowConfig?.id ?? null,
        title,
        messages: [],
        streaming: true,
      });

      await updateWorkflowRunStatus(run.id, "running");

      try {
        const assistantText = await this.runWorkflow(
          run,
          projectPath,
          runId,
          title,
          workflowConfig,
        );
        const tools = workflowConfig?.tools ?? defaultToolsForEvent(run.event);
        const runResults = await buildRunResultFields({
          assistantText,
          run,
          workflowConfig,
          projectPath,
        });
        await updateWorkflowRunStatus(run.id, "done", {
          iteration: run.iteration,
          ...runResults,
          ...(assistantText && (tools.teamsNotify || tools.discordNotify)
            ? { teamsAssistantText: assistantText }
            : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const partialMessages = this.activeRuns.get(runId)?.messages ?? [];
        const partialText = partialMessages.length
          ? extractAssistantText(partialMessages)
          : null;
        const runResults = partialText
          ? await buildRunResultFields({
              assistantText: partialText,
              run,
              workflowConfig,
              projectPath,
            })
          : {};
        await updateWorkflowRunStatus(run.id, "failed", {
          errorMessage: message,
          ...runResults,
        });
        this.notifyRunUpdate({
          runId,
          workflowId: run.workflowId ?? workflowConfig?.id ?? null,
          title,
          messages: [{ role: "assistant", content: `Workflow failed: ${message}` }],
          streaming: false,
        });
      }
    } finally {
      if (this.executingRunId === run.id) {
        this.executingRunId = null;
        this.notifyActivityChange();
      }
    }
  }

  private async runWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    runId: string,
    title: string,
    workflowConfig: WorkflowConfigSnapshot | null,
  ): Promise<string | null> {
    if (run.event === "teams_mention" || run.event === "discord_mention") {
      return this.runBugTriageWorkflow(run, projectPath, runId, title, workflowConfig);
    }

    if (run.event === "schedule" || run.event === "manual" || run.prNumber === 0) {
      return this.runScheduledWorkflow(run, projectPath, runId, title, workflowConfig);
    }

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
          await fetchPrContext(repo.provider, repo.namespace, repo.repoName, run.prNumber),
          reviewId,
        )
      : await fetchPrContext(repo.provider, repo.namespace, repo.repoName, run.prNumber);

    const { worktreePath } = await preparePrWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: repo.namespace,
      repo: repo.repoName,
      prNumber: run.prNumber,
      headRef,
      headSha,
      credentials: await fetchGitCredentials(repo.provider, repo.namespace, repo.repoName),
    });

    const tools = workflowConfig?.tools ?? defaultToolsForEvent(run.event);
    const prompt = buildWorkflowPrompt(context, run, workflowConfig);
    const model = parseModelRef(workflowConfig?.model ?? "");
    const githubActionsEnv = await buildWorkflowGithubActionsEnv(run, tools, run.prNumber);

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      env: githubActionsEnv,
      onEvent: (event) => {
        this.forwardPiEvent(runId, event);
      },
    });

    this.notifyRunUpdate({
      runId,
      workflowId: run.workflowId ?? workflowConfig?.id ?? null,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    return piResult.assistantText;
  }

  private async runBugTriageWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    runId: string,
    title: string,
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
    const creds = await fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
    const { worktreePath } = await prepareBranchWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: repo.namespace,
      repo: repo.repoName,
      branch: resolvedBranch,
      credentials: creds,
    });

    const prompt = buildBugTriageWorkflowPrompt(run, resolvedBranch, workflowConfig);
    const model = parseModelRef(workflowConfig?.model ?? "");

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      onEvent: (event) => {
        this.forwardPiEvent(runId, event);
      },
    });

    this.notifyRunUpdate({
      runId,
      workflowId: run.workflowId ?? workflowConfig?.id ?? null,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    return piResult.assistantText;
  }

  private async runScheduledWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    runId: string,
    title: string,
    workflowConfig: WorkflowConfigSnapshot | null,
  ): Promise<string> {
    const payload = run.payload as { branch?: string };
    const branch = payload.branch?.trim();
    if (!branch) {
      throw new Error("Missing branch in scheduled workflow payload");
    }

    const repo = runRepo(run);
    const creds = await fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
    const { worktreePath } = await prepareBranchWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: repo.namespace,
      repo: repo.repoName,
      branch,
      credentials: creds,
    });

    const prompt = buildScheduledWorkflowPrompt(run, branch, workflowConfig);
    const model = parseModelRef(workflowConfig?.model ?? "");
    const tools = workflowConfig?.tools ?? DEFAULT_SCHEDULED_TOOLS;
    const githubActionsEnv = await buildWorkflowGithubActionsEnv(run, tools);

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      env: githubActionsEnv,
      onEvent: (event) => {
        this.forwardPiEvent(runId, event);
      },
    });

    this.notifyRunUpdate({
      runId,
      workflowId: run.workflowId ?? workflowConfig?.id ?? null,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    return piResult.assistantText;
  }

  private forwardPiEvent(runId: string, event: unknown): void {
    this.window?.webContents.send("harness:event", {
      sessionKey: `workflow-run::${runId}`,
      event,
    });
  }

  private notifyRunUpdate(options: WorkflowRunUpdateNotification): void {
    this.activeRuns.set(options.runId, options);
    this.deliverRunUpdate(options);
  }

  private deliverRunUpdate(payload: WorkflowRunUpdateNotification): void {
    if (!this.rendererReady) return;
    this.window?.webContents.send("harness:workflow-run-update", payload);
  }

  syncRunsToRenderer(): void {
    for (const payload of this.activeRuns.values()) {
      this.deliverRunUpdate(payload);
    }
  }
}

function runRepo(run: WorkflowRunEvent): {
  provider: SourceControlProviderId;
  namespace: string;
  repoName: string;
} {
  return {
    provider: run.provider ?? "github",
    namespace: run.namespace ?? run.githubOwner,
    repoName: run.repoName ?? run.githubRepo,
  };
}

function extractWorkflowConfig(run: WorkflowRunEvent): WorkflowConfigSnapshot | null {
  const payload = run.payload as { workflow?: WorkflowConfigSnapshot };
  return payload.workflow ?? null;
}

function parseModelRef(model: string): { provider: string; modelId: string } | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

function defaultToolsForEvent(event: string): WorkflowTools {
  if (event === "review_submitted" || event === "pr_comment_on_diff") {
    return {
      prComment: true,
      prApprove: false,
      prPush: true,
      prCreate: false,
      teamsNotify: false,
    };
  }
  return {
    prComment: true,
    prApprove: true,
    prPush: false,
    prCreate: false,
    teamsNotify: false,
  };
}

async function buildWorkflowGithubActionsEnv(
  run: WorkflowRunEvent,
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

function expandWorkflowInstructions(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const tools = extractToolInvocationsFromText(trimmed);
  return expandPromptTools(trimmed, tools);
}

function buildWorkflowPrompt(
  context: PrContext,
  run: WorkflowRunEvent,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const pr = context.pullRequest;
  const payload = run.payload as { review?: { body?: string | null } };
  const threads = JSON.stringify(context.threads, null, 2).slice(0, 80_000);
  const issueComments = JSON.stringify(context.issueComments, null, 2).slice(0, 40_000);

  const instructions =
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated pull request agent for OpenHarness. Complete the task using the repository worktree.",
    );

  return `${instructions}

Pull request #${run.prNumber} (${pr.title})
PR URL: ${pr.url}
Provider: ${context.provider}
Trigger: ${run.event}

--- DIFF ---
${context.diff.slice(0, 120_000)}

--- PR BODY ---
${pr.body ?? ""}

--- ISSUE COMMENTS ---
${issueComments}

--- REVIEW THREADS ---
${threads}

--- REVIEW SUBMISSION ---
${payload.review?.body ?? ""}
`;
}

function buildScheduledWorkflowPrompt(
  run: WorkflowRunEvent,
  branch: string,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const instructions =
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated repository agent for OpenHarness. Complete the task using the repository worktree.",
    );

  return `${instructions}

Repository: ${runRepo(run).namespace}/${runRepo(run).repoName}
Branch: ${branch}
Trigger: scheduled

Work in the checked-out branch worktree. There is no pull request context for this run.
`;
}

function buildBugTriageWorkflowPrompt(
  run: WorkflowRunEvent,
  branch: string,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const payload = run.payload as {
    teams?: { teamsMessageText?: string };
    discord?: { discordMessageText?: string };
  };
  const bugReport =
    payload.teams?.teamsMessageText?.trim() ??
    payload.discord?.discordMessageText?.trim() ??
    "";
  const isDiscord = run.event === "discord_mention";
  const defaultInstructions = isDiscord
    ? "You are an automated bug triage agent for OpenHarness. Investigate the Discord bug report using the repository worktree."
    : "You are an automated bug triage agent for OpenHarness. Investigate the Teams bug report using the repository worktree.";

  const instructions = expandWorkflowInstructions(
    workflowConfig?.instructions?.trim() || defaultInstructions,
  );

  return `${instructions}

Repository: ${runRepo(run).namespace}/${runRepo(run).repoName}
Branch: ${branch}
Trigger: ${run.event}

--- ${isDiscord ? "DISCORD" : "TEAMS"} BUG REPORT ---
${bugReport}
`;
}

function filterPrContextForReview(context: PrContext, reviewId?: number | string): PrContext {
  if (reviewId == null) return context;

  const reviewIdStr = String(reviewId);
  const threads = context.threads.filter((thread) => {
    const first = thread.comments[0];
    return (
      first?.reviewId === reviewIdStr ||
      thread.comments.some((comment) => comment.reviewId === reviewIdStr)
    );
  });

  return {
    ...context,
    threads,
    issueComments: [],
  };
}

let runner: WorkflowRunner | null = null;

export function getWorkflowRunner(): WorkflowRunner {
  if (!runner) {
    runner = new WorkflowRunner();
  }
  return runner;
}
