import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import {
  claimWorkflowRun,
  fetchGitCredentials,
  fetchPendingWorkflowRuns,
  fetchPrContext,
  listOrgGithubConnections,
  OpenHarnessApiError,
  postIssueComment,
  postPrReview,
  postPrReviewComment,
  replyToReviewComment,
  resolveReviewThread,
  updateWorkflowRunStatus,
  upsertRunnerBinding,
  type PrContext,
  type SourceControlProviderId,
  type WorkflowConfigSnapshot,
  type WorkflowRunPayload,
  type WorkflowTools,
} from "./openharness-api.js";
import { getGitRemoteInfo } from "./git-remote.js";
import { getWorkflowRunnerInstanceId } from "./runner-instance.js";
import { appStore } from "./store.js";
import {
  commitAllChanges,
  getWorkflowWorktreesRoot,
  isGitRepository,
  preparePrWorktree,
  prepareBranchWorktree,
  pushWorktreeBranch,
} from "./workflow-git.js";
import { parseReviewDecision, runHeadlessPiPrompt } from "./workflow-pi.js";
import { parseTeamsReport } from "./workflow-teams-parse.js";
import { expandPromptTools } from "./thread-tools.js";
import { extractToolInvocationsFromText } from "../shared/thread-tools.js";
import {
  appendOverflowToSummary,
  validateInlineComments,
  type InlineReviewComment,
  type PrFileChange,
} from "./workflow-review-lines.js";

const FIXER_MARKER = "<!-- openharness:fixer -->";
const FIXER_COMMIT_TRAILER = "OpenHarness-Workflow: fixer";
const MAX_WORKFLOW_ITERATIONS = 5;
const POLL_INTERVAL_MS = 5_000;
const AUTH_POLL_BACKOFF_MS = 15_000;

type WorkflowRunEvent = WorkflowRunPayload & { id: string };

type WorkflowConversationNotification = {
  conversationId: string;
  projectCwd: string;
  title: string;
  messages: unknown[];
  source: "github-workflow";
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
  private activeConversations = new Map<string, WorkflowConversationNotification>();
  private activityChangeListener: (() => void) | null = null;

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  setRendererReady(ready: boolean): void {
    this.rendererReady = ready;
    if (ready) {
      this.syncConversationsToRenderer();
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
    void this.pollPendingRuns();
    this.pollTimer = setInterval(() => void this.pollPendingRuns(), POLL_INTERVAL_MS);
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
      const conversationId = randomUUID();
      const title =
        workflowConfig?.name ??
        (run.event === "teams_mention"
          ? "Teams bug triage"
          : run.event === "schedule"
            ? "Scheduled workflow"
            : run.prNumber > 0
              ? `PR #${run.prNumber}`
              : "Workflow");

      this.notifyConversation({
        conversationId,
        projectCwd: projectPath,
        title,
        messages: [],
        streaming: true,
      });

      await updateWorkflowRunStatus(run.id, "running");

      try {
        const assistantText = await this.runWorkflow(
          run,
          projectPath,
          conversationId,
          title,
          workflowConfig,
        );
        const tools = workflowConfig?.tools ?? defaultToolsForEvent(run.event);
        await updateWorkflowRunStatus(run.id, "done", {
          iteration: run.iteration,
          ...(tools.teamsNotify && assistantText
            ? {
                teamsResult: parseTeamsReport(
                  assistantText,
                  run.event === "teams_mention" ? "bug_triage" : "cve_scan",
                ),
              }
            : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateWorkflowRunStatus(run.id, "failed", { errorMessage: message });
        this.notifyConversation({
          conversationId,
          projectCwd: projectPath,
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
    conversationId: string,
    title: string,
    workflowConfig: WorkflowConfigSnapshot | null,
  ): Promise<string | null> {
    if (run.event === "teams_mention") {
      return this.runTeamsWorkflow(run, projectPath, conversationId, title, workflowConfig);
    }

    if (run.event === "schedule" || run.event === "manual" || run.prNumber === 0) {
      return this.runScheduledWorkflow(run, projectPath, conversationId, title, workflowConfig);
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

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      onEvent: (event) => {
        this.forwardPiEvent(conversationId, projectPath, event);
      },
    });

    this.notifyConversation({
      conversationId,
      projectCwd: projectPath,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    const wantsPush =
      tools.prPush ||
      run.event === "review_submitted" ||
      run.event === "pr_comment_on_diff";

    if (wantsPush) {
      const committed = await commitAllChanges(
        worktreePath,
        `fix: address PR #${run.prNumber} workflow feedback\n\n${FIXER_COMMIT_TRAILER}`,
      );

      if (committed && tools.prPush) {
        const creds = await fetchGitCredentials(repo.provider, repo.namespace, repo.repoName);
        await pushWorktreeBranch({
          worktreePath,
          remoteUrl: creds.remoteUrl,
          username: creds.username,
          token: creds.token,
          headRef,
        });
      }

      if (tools.prComment) {
        await resolveReviewThreads(run, context, committed);
      }
      return piResult.assistantText;
    }

    await applyReviewActions(run, headSha, piResult.assistantText, tools, context);
    return piResult.assistantText;
  }

  private async runTeamsWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    conversationId: string,
    title: string,
    workflowConfig: WorkflowConfigSnapshot | null,
  ): Promise<string> {
    const payload = run.payload as {
      branch?: string;
      teams?: { teamsMessageText?: string };
    };
    const resolvedBranch = payload.branch?.trim();
    if (!resolvedBranch) {
      throw new Error("Missing branch in Teams workflow payload");
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

    const prompt = buildTeamsWorkflowPrompt(run, resolvedBranch, workflowConfig);
    const model = parseModelRef(workflowConfig?.model ?? "");

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      onEvent: (event) => {
        this.forwardPiEvent(conversationId, projectPath, event);
      },
    });

    this.notifyConversation({
      conversationId,
      projectCwd: projectPath,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    return piResult.assistantText;
  }

  private async runScheduledWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    conversationId: string,
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

    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
      model,
      onEvent: (event) => {
        this.forwardPiEvent(conversationId, projectPath, event);
      },
    });

    this.notifyConversation({
      conversationId,
      projectCwd: projectPath,
      title,
      messages: piResult.messages,
      streaming: false,
    });

    return piResult.assistantText;
  }

  private forwardPiEvent(conversationId: string, projectCwd: string, event: unknown): void {
    this.window?.webContents.send("harness:event", {
      sessionKey: `${projectCwd}::draft::${conversationId}`,
      event,
    });
  }

  private notifyConversation(options: {
    conversationId: string;
    projectCwd: string;
    title: string;
    messages: unknown[];
    streaming: boolean;
  }): void {
    const payload: WorkflowConversationNotification = {
      conversationId: options.conversationId,
      projectCwd: options.projectCwd,
      title: options.title,
      messages: options.messages,
      source: "github-workflow",
      streaming: options.streaming,
    };
    this.activeConversations.set(options.conversationId, payload);
    this.deliverConversation(payload);
  }

  private deliverConversation(payload: WorkflowConversationNotification): void {
    if (!this.rendererReady) return;
    this.window?.webContents.send("harness:workflow-conversation", payload);
  }

  syncConversationsToRenderer(): void {
    for (const payload of this.activeConversations.values()) {
      this.deliverConversation(payload);
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
    return { prComment: true, prApprove: false, prPush: true, teamsNotify: false };
  }
  return { prComment: true, prApprove: true, prPush: false, teamsNotify: false };
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

function buildTeamsWorkflowPrompt(
  run: WorkflowRunEvent,
  branch: string,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const payload = run.payload as { teams?: { teamsMessageText?: string } };
  const teamsMessage = payload.teams?.teamsMessageText?.trim() ?? "";

  const instructions =
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated bug triage agent for OpenHarness. Investigate the Teams bug report using the repository worktree.",
    );

  return `${instructions}

Repository: ${runRepo(run).namespace}/${runRepo(run).repoName}
Branch: ${branch}
Trigger: teams_mention

--- TEAMS BUG REPORT ---
${teamsMessage}
`;
}

async function applyReviewActions(
  run: WorkflowRunEvent,
  headSha: string,
  assistantText: string,
  tools: WorkflowTools,
  context: PrContext,
): Promise<void> {
  if (!tools.prComment && !tools.prApprove) return;

  const repo = runRepo(run);
  const decision = parseReviewDecision(assistantText);

  if (run.iteration >= MAX_WORKFLOW_ITERATIONS && decision.action === "comment") {
    if (tools.prComment) {
      await postIssueComment(
        repo.provider,
        repo.namespace,
        repo.repoName,
        run.prNumber,
        `OpenHarness stopped after ${MAX_WORKFLOW_ITERATIONS} review cycles. Please address remaining feedback manually.`,
      );
    }
    return;
  }

  if (decision.action === "approve" && tools.prApprove) {
    await postPrReview(repo.provider, repo.namespace, repo.repoName, run.prNumber, {
      event: "APPROVE",
      commitId: headSha,
      body: decision.summary,
    });
    return;
  }

  if (tools.prComment) {
    if (decision.action === "comment" && decision.inlineComments.length > 0) {
      await submitReviewWithInlineComments(
        repo,
        run.prNumber,
        headSha,
        decision.summary,
        decision.inlineComments,
        context.files,
      );
      return;
    }

    const body = decision.summary || assistantText.trim() || "Workflow completed.";
    await postPrReview(repo.provider, repo.namespace, repo.repoName, run.prNumber, {
      event: "COMMENT",
      commitId: headSha,
      body,
    });
  }
}

async function resolveReviewThreads(
  run: WorkflowRunEvent,
  context: PrContext,
  committed: boolean,
): Promise<void> {
  const repo = runRepo(run);
  const threads = context.threads;

  for (const thread of threads) {
    if (thread.isResolved) continue;
    const replyBody = `${FIXER_MARKER}\n\nAddressed in latest commit.`;
    const firstComment = thread.comments[0];
    if (firstComment?.id) {
      const replyTarget =
        context.provider === "azure_devops" ? thread.id : firstComment.id;
      await replyToReviewComment(
        repo.provider,
        repo.namespace,
        repo.repoName,
        run.prNumber,
        replyTarget,
        replyBody,
      ).catch(() => {});
    }
    await resolveReviewThread(
      repo.provider,
      repo.namespace,
      repo.repoName,
      run.prNumber,
      thread.id,
    ).catch(() => {});
  }

  if (committed) {
    await postIssueComment(
      repo.provider,
      repo.namespace,
      repo.repoName,
      run.prNumber,
      `${FIXER_MARKER}\n\nPushed fixes for PR #${run.prNumber}.`,
    ).catch(() => {});
  }
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

async function submitReviewWithInlineComments(
  repo: { provider: SourceControlProviderId; namespace: string; repoName: string },
  prNumber: number,
  commitId: string,
  summary: string,
  inlineComments: InlineReviewComment[],
  files: PrFileChange[],
): Promise<void> {
  const { valid, invalid } = validateInlineComments(files, inlineComments);
  const failed: InlineReviewComment[] = [];
  const reviewSummary = appendOverflowToSummary(summary, invalid, []);

  if (valid.length === 0) {
    await postPrReview(repo.provider, repo.namespace, repo.repoName, prNumber, {
      event: "COMMENT",
      commitId,
      body: reviewSummary,
    });
    return;
  }

  try {
    await postPrReview(repo.provider, repo.namespace, repo.repoName, prNumber, {
      event: "COMMENT",
      commitId,
      body: reviewSummary,
      comments: valid,
    });
    return;
  } catch (err) {
    console.warn("[workflow-runner] batch review post failed, retrying individually", err);
  }

  await postPrReview(repo.provider, repo.namespace, repo.repoName, prNumber, {
    event: "COMMENT",
    commitId,
    body: reviewSummary,
  });

  for (const comment of valid) {
    try {
      await postPrReviewComment(repo.provider, repo.namespace, repo.repoName, prNumber, {
        commitId,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        body: comment.body,
      });
    } catch (err) {
      console.warn("[workflow-runner] inline comment post failed", comment.path, comment.line, err);
      failed.push(comment);
    }
  }

  if (failed.length > 0) {
    const overflow = failed
      .map((comment) => `- \`${comment.path}:${comment.line}\`: ${comment.body}`)
      .join("\n");
    await postIssueComment(
      repo.provider,
      repo.namespace,
      repo.repoName,
      prNumber,
      `**Additional feedback (could not post inline):**\n${overflow}`,
    ).catch(() => {});
  }
}

let runner: WorkflowRunner | null = null;

export function getWorkflowRunner(): WorkflowRunner {
  if (!runner) {
    runner = new WorkflowRunner();
  }
  return runner;
}
