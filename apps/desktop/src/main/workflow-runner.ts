import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import {
  claimWorkflowRun,
  fetchGitCredentials,
  fetchPrContext,
  OpenHarnessApiError,
  postIssueComment,
  postPrReview,
  postPrReviewComment,
  replyToReviewComment,
  resolveReviewThread,
  streamWorkflowRuns,
  updateWorkflowRunStatus,
  type PrContext,
  type WorkflowConfigSnapshot,
  type WorkflowRunPayload,
  type WorkflowTools,
} from "./openharness-api.js";
import { appStore } from "./store.js";
import {
  commitAllChanges,
  getWorkflowWorktreesRoot,
  isGitRepository,
  preparePrWorktree,
  pushWorktreeBranch,
} from "./workflow-git.js";
import { parseReviewDecision, runHeadlessPiPrompt } from "./workflow-pi.js";
import {
  appendOverflowToSummary,
  validateInlineComments,
  type InlineReviewComment,
  type PrFileChange,
} from "./workflow-review-lines.js";

const FIXER_MARKER = "<!-- openharness:fixer -->";
const FIXER_COMMIT_TRAILER = "OpenHarness-Workflow: fixer";
const MAX_WORKFLOW_ITERATIONS = 5;

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
  private processing = false;
  private queue: WorkflowRunEvent[] = [];
  private executingRunId: string | null = null;
  private rendererReady = false;
  private activeConversations = new Map<string, WorkflowConversationNotification>();

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  setRendererReady(ready: boolean): void {
    this.rendererReady = ready;
    if (ready) {
      this.syncConversationsToRenderer();
    }
  }

  start(): void {
    if (this.abortController) return;
    this.abortController = new AbortController();
    void this.subscribe();
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private getInstanceId(): string {
    const existing = appStore.get("workflowRunnerInstanceId");
    if (existing) return existing;
    const id = `${process.env.USER ?? "desktop"}-${randomUUID()}`;
    appStore.set("workflowRunnerInstanceId", id);
    return id;
  }

  private getWorktreesRoot(): string {
    return getWorkflowWorktreesRoot();
  }

  private async subscribe(): Promise<void> {
    const signal = this.abortController?.signal;
    if (!signal) return;

    try {
      await streamWorkflowRuns(
        (run) => {
          if (this.executingRunId === run.id) return;
          if (this.queue.some((queued) => queued.id === run.id)) return;
          this.queue.push(run);
          void this.processQueue();
        },
        signal,
      );
    } catch (err) {
      if (signal.aborted) return;
      const isAuth = err instanceof OpenHarnessApiError && err.status === 401;
      if (isStreamDisconnectError(err)) {
        console.warn("[workflow-runner] stream disconnected, reconnecting…");
      } else {
        console.error("[workflow-runner] stream error", err);
      }
      await delay(isAuth ? 15_000 : 5_000);
      if (!signal.aborted) void this.subscribe();
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
  }

  private async executeRun(run: WorkflowRunEvent): Promise<void> {
    this.executingRunId = run.id;
    try {
      const claimed = await claimWorkflowRun(run.id, this.getInstanceId()).catch((err) => {
        if (err instanceof OpenHarnessApiError && err.status === 409) return null;
        throw err;
      });
      if (!claimed) return;

      const projectPath = run.projectPath;
      if (!existsSync(projectPath) || !(await isGitRepository(projectPath))) {
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
      const title = workflowConfig?.name ?? `PR #${run.prNumber}`;

      this.notifyConversation({
        conversationId,
        projectCwd: projectPath,
        title,
        messages: [],
        streaming: true,
      });

      await updateWorkflowRunStatus(run.id, "running");

      try {
        await this.runWorkflow(run, projectPath, conversationId, title, workflowConfig);
        await updateWorkflowRunStatus(run.id, "done", { iteration: run.iteration });
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
      }
    }
  }

  private async runWorkflow(
    run: WorkflowRunEvent,
    projectPath: string,
    conversationId: string,
    title: string,
    workflowConfig: WorkflowConfigSnapshot | null,
  ): Promise<void> {
    const payload = run.payload as {
      pullRequest?: {
        headRef?: string;
        headSha?: string;
        baseRef?: string;
        title?: string;
      };
      review?: { id?: number; body?: string; state?: string };
    };

    const headRef = payload.pullRequest?.headRef;
    const headSha = payload.pullRequest?.headSha;
    if (!headRef || !headSha) {
      throw new Error("Missing PR head ref/sha in workflow payload");
    }

    const reviewId = payload.review?.id;
    const context = reviewId
      ? filterPrContextForReview(
          await fetchPrContext(run.githubOwner, run.githubRepo, run.prNumber),
          reviewId,
        )
      : await fetchPrContext(run.githubOwner, run.githubRepo, run.prNumber);

    const { worktreePath } = await preparePrWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: run.githubOwner,
      repo: run.githubRepo,
      prNumber: run.prNumber,
      headRef,
      headSha,
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
        const creds = await fetchGitCredentials(run.githubOwner, run.githubRepo);
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
      return;
    }

    await applyReviewActions(run, headSha, piResult.assistantText, tools, context);
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
    return { memories: true, prComment: true, prApprove: false, prPush: true };
  }
  return { memories: true, prComment: true, prApprove: true, prPush: false };
}

function buildWorkflowPrompt(
  context: PrContext,
  run: WorkflowRunEvent,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const pr = context.pullRequest as { title?: string; body?: string | null; html_url?: string };
  const payload = run.payload as { review?: { body?: string | null } };
  const reviewComments = JSON.stringify(context.reviewComments, null, 2).slice(0, 80_000);
  const threads = JSON.stringify(context.reviewThreads, null, 2).slice(0, 80_000);

  const instructions =
    workflowConfig?.instructions?.trim() ||
    "You are an automated GitHub pull request agent for OpenHarness. Complete the task using the repository worktree.";

  return `${instructions}

Pull request #${run.prNumber} (${pr.title ?? "untitled"})
PR URL: ${pr.html_url ?? "unknown"}
Trigger: ${run.event}

--- DIFF ---
${context.diff.slice(0, 120_000)}

--- PR BODY ---
${pr.body ?? ""}

--- REVIEW COMMENTS ---
${reviewComments}

--- REVIEW THREADS ---
${threads}

--- REVIEW SUBMISSION ---
${payload.review?.body ?? ""}
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

  const decision = parseReviewDecision(assistantText);

  if (run.iteration >= MAX_WORKFLOW_ITERATIONS && decision.action === "comment") {
    if (tools.prComment) {
      await postIssueComment(
        run.githubOwner,
        run.githubRepo,
        run.prNumber,
        `OpenHarness stopped after ${MAX_WORKFLOW_ITERATIONS} review cycles. Please address remaining feedback manually.`,
      );
    }
    return;
  }

  if (decision.action === "approve" && tools.prApprove) {
    await postPrReview(run.githubOwner, run.githubRepo, run.prNumber, {
      event: "APPROVE",
      commitId: headSha,
      body: decision.summary,
    });
    return;
  }

  if (tools.prComment) {
    if (decision.action === "comment" && decision.inlineComments.length > 0) {
      await submitReviewWithInlineComments(
        run.githubOwner,
        run.githubRepo,
        run.prNumber,
        headSha,
        decision.summary,
        decision.inlineComments,
        context.files as PrFileChange[],
      );
      return;
    }

    const body = decision.summary || assistantText.trim() || "Workflow completed.";
    await postPrReview(run.githubOwner, run.githubRepo, run.prNumber, {
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
  const threads = context.reviewThreads as Array<{
    id: string;
    isResolved: boolean;
    comments: { nodes: Array<{ databaseId: number; body: string }> };
  }>;

  for (const thread of threads) {
    if (thread.isResolved) continue;
    const replyBody = `${FIXER_MARKER}\n\nAddressed in latest commit.`;
    const firstComment = thread.comments.nodes[0];
    if (firstComment?.databaseId) {
      await replyToReviewComment(
        run.githubOwner,
        run.githubRepo,
        run.prNumber,
        firstComment.databaseId,
        replyBody,
      ).catch(() => {});
    }
    await resolveReviewThread(run.githubOwner, run.githubRepo, thread.id).catch(() => {});
  }

  if (committed) {
    await postIssueComment(
      run.githubOwner,
      run.githubRepo,
      run.prNumber,
      `${FIXER_MARKER}\n\nPushed fixes for PR #${run.prNumber}.`,
    ).catch(() => {});
  }
}

function filterPrContextForReview(context: PrContext, reviewId?: number): PrContext {
  if (!reviewId) return context;

  const reviewComments = (
    context.reviewComments as Array<{ id?: number; pull_request_review_id?: number }>
  ).filter((comment) => comment.pull_request_review_id === reviewId);

  const commentIds = new Set(
    reviewComments.map((comment) => comment.id).filter((id): id is number => id != null),
  );

  const reviewThreads = (
    context.reviewThreads as Array<{
      id: string;
      isResolved: boolean;
      comments: { nodes: Array<{ databaseId?: number; body?: string }> };
    }>
  ).filter((thread) => {
    const firstId = thread.comments.nodes[0]?.databaseId;
    return firstId != null && commentIds.has(firstId);
  });

  return {
    ...context,
    reviewComments,
    reviewThreads,
    issueComments: [],
  };
}

async function submitReviewWithInlineComments(
  owner: string,
  repo: string,
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
    await postPrReview(owner, repo, prNumber, {
      event: "COMMENT",
      commitId,
      body: reviewSummary,
    });
    return;
  }

  try {
    await postPrReview(owner, repo, prNumber, {
      event: "COMMENT",
      commitId,
      body: reviewSummary,
      comments: valid,
    });
    return;
  } catch (err) {
    console.warn("[workflow-runner] batch review post failed, retrying individually", err);
  }

  await postPrReview(owner, repo, prNumber, {
    event: "COMMENT",
    commitId,
    body: reviewSummary,
  });

  for (const comment of valid) {
    try {
      await postPrReviewComment(owner, repo, prNumber, {
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
      owner,
      repo,
      prNumber,
      `**Additional feedback (could not post inline):**\n${overflow}`,
    ).catch(() => {});
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStreamDisconnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: string }).code)
      : "";
  return (
    err.message === "terminated" ||
    err.message === "fetch failed" ||
    causeCode === "UND_ERR_BODY_TIMEOUT" ||
    causeCode === "UND_ERR_SOCKET" ||
    causeCode === "ECONNREFUSED"
  );
}

let runner: WorkflowRunner | null = null;

export function getWorkflowRunner(): WorkflowRunner {
  if (!runner) {
    runner = new WorkflowRunner();
  }
  return runner;
}
