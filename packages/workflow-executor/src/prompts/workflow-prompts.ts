import { appendWorkflowNotifyRequirements, expandWorkflowInstructions } from "@openharness/shared/workflow-prompt-tools";
import type {
  WorkflowConfigSnapshot,
  WorkflowRunExecutionRecord,
} from "@openharness/shared/workflow-run";
import type { PrContext } from "../deps.js";
import { runRepo } from "../helpers/run-repo.js";

export function buildWorkflowPrompt(
  context: PrContext,
  run: WorkflowRunExecutionRecord,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const pr = context.pullRequest;
  const payload = run.payload as { review?: { body?: string | null } };
  const threads = JSON.stringify(context.threads, null, 2).slice(0, 80_000);
  const issueComments = JSON.stringify(context.issueComments, null, 2).slice(0, 40_000);

  const instructions = appendWorkflowNotifyRequirements(
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated pull request agent for OpenHarness. Complete the task using the repository worktree.",
    ),
    workflowConfig?.tools,
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

export function buildScheduledWorkflowPrompt(
  run: WorkflowRunExecutionRecord,
  branch: string,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const instructions = appendWorkflowNotifyRequirements(
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated repository agent for OpenHarness. Complete the task using the repository worktree.",
    ),
    workflowConfig?.tools,
  );
  const repo = runRepo(run);

  return `${instructions}

Repository: ${repo.namespace}/${repo.repoName}
Branch: ${branch}
Trigger: scheduled

Work in the checked-out branch worktree. There is no pull request context for this run.
`;
}

export function buildBugTriageWorkflowPrompt(
  run: WorkflowRunExecutionRecord,
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

  const instructions = appendWorkflowNotifyRequirements(
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() || defaultInstructions,
    ),
    workflowConfig?.tools,
  );
  const repo = runRepo(run);

  return `${instructions}

Repository: ${repo.namespace}/${repo.repoName}
Branch: ${branch}
Trigger: ${run.event}

--- ${isDiscord ? "DISCORD" : "TEAMS"} BUG REPORT ---
${bugReport}
`;
}

export function buildLinearWorkflowPrompt(
  run: WorkflowRunExecutionRecord,
  branch: string,
  workflowConfig: WorkflowConfigSnapshot | null,
): string {
  const payload = run.payload as {
    linear?: {
      event?: string;
      projectId?: string;
      projectName?: string;
      issueId?: string;
      issueIdentifier?: string;
      issueTitle?: string;
      issueDescription?: string;
      commentBody?: string;
    };
  };
  const linear = payload.linear ?? {};

  const instructions = appendWorkflowNotifyRequirements(
    expandWorkflowInstructions(
      workflowConfig?.instructions?.trim() ||
        "You are an automated agent for OpenHarness. Use the repository worktree and Linear tools as needed to complete the task described by the workflow instructions.",
    ),
    workflowConfig?.tools,
  );
  const repo = runRepo(run);

  const issueContext = [
    linear.issueIdentifier ? `Identifier: ${linear.issueIdentifier}` : null,
    linear.issueId ? `Issue ID: ${linear.issueId}` : null,
    linear.issueTitle ? `Title: ${linear.issueTitle}` : null,
    linear.projectName ? `Project: ${linear.projectName}` : null,
    linear.issueDescription ? `Description:\n${linear.issueDescription}` : null,
    linear.commentBody ? `Triggering comment:\n${linear.commentBody}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${instructions}

Repository: ${repo.namespace}/${repo.repoName}
Branch: ${branch}
Trigger: ${run.event}

--- LINEAR ISSUE CONTEXT ---
${issueContext || "(no issue metadata in payload)"}
`;
}

export function filterPrContextForReview(context: PrContext, reviewId?: number | string): PrContext {
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
