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
  type WorkflowRunPayload,
  type PrContext,
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

      const conversationId = randomUUID();
      const title =
        run.workflowType === "pr_review"
          ? `PR #${run.prNumber} review`
          : `PR #${run.prNumber} fixes`;

      this.notifyConversation({
        conversationId,
        projectCwd: projectPath,
        title,
        messages: [],
        streaming: true,
      });

      await updateWorkflowRunStatus(run.id, "running");

      try {
        if (run.workflowType === "pr_review") {
          await this.runPrReview(run, projectPath, conversationId, title);
        } else {
          await this.runCommentFixer(run, projectPath, conversationId, title);
        }
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

  private async runPrReview(
    run: WorkflowRunEvent,
    projectPath: string,
    conversationId: string,
    title: string,
  ): Promise<void> {
    const payload = run.payload as {
      pullRequest?: {
        headRef?: string;
        headSha?: string;
        baseRef?: string;
        title?: string;
      };
    };
    const headRef = payload.pullRequest?.headRef;
    const headSha = payload.pullRequest?.headSha;
    if (!headRef || !headSha) {
      throw new Error("Missing PR head ref/sha in workflow payload");
    }

    const context = await fetchPrContext(run.githubOwner, run.githubRepo, run.prNumber);
    const { worktreePath } = await preparePrWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: run.githubOwner,
      repo: run.githubRepo,
      prNumber: run.prNumber,
      headRef,
      headSha,
    });

    const prompt = buildReviewPrompt(context, run);
    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
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

    const decision = parseReviewDecision(piResult.assistantText);

    if (run.iteration >= MAX_WORKFLOW_ITERATIONS && decision.action === "comment") {
      await postIssueComment(
        run.githubOwner,
        run.githubRepo,
        run.prNumber,
        `OpenHarness stopped after ${MAX_WORKFLOW_ITERATIONS} review cycles. Please address remaining feedback manually.`,
      );
      return;
    }

    if (decision.action === "approve") {
      await postPrReview(run.githubOwner, run.githubRepo, run.prNumber, {
        event: "APPROVE",
        commitId: headSha,
        body: decision.summary,
      });
      return;
    }

    await submitReviewWithInlineComments(
      run.githubOwner,
      run.githubRepo,
      run.prNumber,
      headSha,
      decision.summary,
      decision.inlineComments,
      context.files as PrFileChange[],
    );
  }

  private async runCommentFixer(
    run: WorkflowRunEvent,
    projectPath: string,
    conversationId: string,
    title: string,
  ): Promise<void> {
    const payload = run.payload as {
      pullRequest?: { headRef?: string; headSha?: string };
      review?: { id?: number; body?: string; state?: string };
    };

    const context = filterPrContextForReview(
      await fetchPrContext(run.githubOwner, run.githubRepo, run.prNumber),
      payload.review?.id,
    );
    const pr = context.pullRequest as { head?: { ref?: string; sha?: string } };
    const headRef = payload.pullRequest?.headRef ?? pr.head?.ref;
    const headSha = payload.pullRequest?.headSha ?? pr.head?.sha;
    if (!headRef || !headSha) {
      throw new Error("Missing PR head ref/sha");
    }

    const { worktreePath } = await preparePrWorktree({
      repoCwd: projectPath,
      worktreesRoot: this.getWorktreesRoot(),
      owner: run.githubOwner,
      repo: run.githubRepo,
      prNumber: run.prNumber,
      headRef,
      headSha,
    });

    const prompt = buildFixerPrompt(context, run);
    const piResult = await runHeadlessPiPrompt({
      cwd: worktreePath,
      prompt,
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

    const committed = await commitAllChanges(
      worktreePath,
      `fix: address PR #${run.prNumber} review feedback\n\n${FIXER_COMMIT_TRAILER}`,
    );

    if (committed) {
      const creds = await fetchGitCredentials(run.githubOwner, run.githubRepo);
      await pushWorktreeBranch({
        worktreePath,
        remoteUrl: creds.remoteUrl,
        username: creds.username,
        token: creds.token,
        headRef,
      });
    }

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

    if (payload.review?.id && committed) {
      await postIssueComment(
        run.githubOwner,
        run.githubRepo,
        run.prNumber,
        `${FIXER_MARKER}\n\nPushed fixes for PR #${run.prNumber}.`,
      ).catch(() => {});
    }
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

function buildReviewPrompt(context: Awaited<ReturnType<typeof fetchPrContext>>, run: WorkflowRunEvent): string {
  const pr = context.pullRequest as { title?: string; body?: string | null; html_url?: string };
  return `You are an automated PR reviewer for OpenHarness.

Review pull request #${run.prNumber} (${pr.title ?? "untitled"}) against the base branch.
PR URL: ${pr.html_url ?? "unknown"}

Focus on bugs, security issues, missing tests, and maintainability problems in the changed code.
Read the relevant files in the worktree. The diff is included below for context.

When finished, respond with ONLY a single JSON code block (\`\`\`json ... \`\`\`) and no other text.
Use this exact shape:
{
  "action": "approve" | "comment",
  "summary": "short review summary for the PR review body",
  "inlineComments": [
    { "path": "relative/file.ts", "line": 42, "body": "actionable feedback" }
  ]
}

Use "approve" only when the PR is ready to merge with no meaningful issues.
Use "comment" when changes are needed; include precise inlineComments anchored to changed lines in the diff.

--- DIFF ---
${context.diff.slice(0, 120_000)}

--- PR BODY ---
${pr.body ?? ""}
`;
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

function buildFixerPrompt(context: PrContext, run: WorkflowRunEvent): string {
  const payload = run.payload as { review?: { id?: number; body?: string; state?: string } };
  const reviewComments = JSON.stringify(context.reviewComments, null, 2).slice(0, 80_000);
  const threads = JSON.stringify(context.reviewThreads, null, 2).slice(0, 80_000);

  return `You are an automated PR fixer for OpenHarness.

Fix the inline review feedback on pull request #${run.prNumber} in this worktree.
Make minimal, focused edits that address the comments. Run tests if appropriate.

Review submission:
${payload.review?.body ?? "(see inline review comments below)"}

Inline review comments to address:
${reviewComments}

Unresolved review threads:
${threads}

After making changes, summarize what you fixed. Do not push — the workflow runner commits and pushes for you.
`;
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
  let reviewSummary = appendOverflowToSummary(summary, invalid, []);

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
