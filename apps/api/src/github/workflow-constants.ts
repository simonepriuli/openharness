import { randomUUID } from "node:crypto";
import type { WorkflowTemplate, WorkflowTemplateId, WorkflowTrigger } from "./workflow-types.js";

export const WORKFLOW_TYPES = ["pr_review", "comment_fixer"] as const;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export const MAX_WORKFLOW_ITERATIONS = 5;
export const FIXER_MARKER = "<!-- openharness:fixer -->";
export const FIXER_COMMIT_TRAILER = "OpenHarness-Workflow: fixer";

export const PR_REVIEW_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "synchronize",
]);

const PR_REVIEW_INSTRUCTIONS = `You are an automated PR reviewer for OpenHarness.

Review the pull request against the base branch.
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
Use "comment" when changes are needed; include precise inlineComments anchored to changed lines in the diff.`;

const COMMENT_FIXER_INSTRUCTIONS = `You are an automated PR fixer for OpenHarness.

Fix the inline review feedback on the pull request in this worktree.
Make minimal, focused edits that address the comments. Run tests if appropriate.

After making changes, summarize what you fixed. Do not push — the workflow runner commits and pushes for you.`;

function trigger(id: string, event: WorkflowTrigger["event"]): WorkflowTrigger {
  return { id, kind: "git_pr", event };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "pr_review",
    name: "PR auto review",
    description:
      "When a pull request opens or updates, review the diff and comment on issues or approve if clean.",
    model: "",
    instructions: PR_REVIEW_INSTRUCTIONS,
    triggers: [
      trigger("pr-opened", "pr_opened"),
      trigger("pr-updated", "pr_updated"),
      trigger("pr-ready", "pr_ready"),
    ],
    tools: {
      memories: true,
      prComment: true,
      prApprove: true,
      prPush: false,
    },
  },
  {
    id: "comment_fixer",
    name: "Autofix PR review comments",
    description:
      "When inline review comments are added on changed lines, apply fixes locally, push to the PR branch, and resolve threads.",
    model: "",
    instructions: COMMENT_FIXER_INSTRUCTIONS,
    triggers: [
      trigger("review-submitted", "review_submitted"),
      trigger("comment-on-diff", "pr_comment_on_diff"),
    ],
    tools: {
      memories: true,
      prComment: true,
      prApprove: false,
      prPush: true,
    },
  },
];

export const WORKFLOW_TEMPLATE_MAP = new Map(
  WORKFLOW_TEMPLATES.map((template) => [template.id, template]),
);

export function getWorkflowTemplate(id: WorkflowTemplateId): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATE_MAP.get(id);
  if (!template) throw new Error(`Unknown workflow template: ${id}`);
  return template;
}

export function createTriggersFromTemplate(id: WorkflowTemplateId): WorkflowTrigger[] {
  return getWorkflowTemplate(id).triggers.map((row) => ({
    ...row,
    id: randomUUID(),
  }));
}

/** @deprecated Use WORKFLOW_TEMPLATES */
export const DEFAULT_WORKFLOW_DEFINITIONS = WORKFLOW_TEMPLATES.map((template) => ({
  type: template.id,
  title: template.name,
  description: template.description,
}));

export function githubAppBotLogin(slug: string | undefined): string | null {
  if (!slug) return null;
  return `${slug}[bot]`;
}

export function isFixerContent(body: string | null | undefined): boolean {
  if (!body) return false;
  return body.includes(FIXER_MARKER);
}

export type CommentSender = {
  login?: string;
  type?: string;
};

export type ReviewFixerTriggerInput = {
  review?: {
    id?: number;
    body?: string | null;
    state?: string;
  } | null;
  sender?: CommentSender;
};

export function isOpenHarnessBotSender(
  sender: CommentSender | undefined,
  botLogin: string | null,
): boolean {
  if (!sender?.login || !botLogin) return false;
  return sender.login.toLowerCase() === botLogin.toLowerCase();
}

export function isAutomationSender(sender: CommentSender | undefined): boolean {
  if (!sender) return false;
  if (sender.type === "Bot") return true;
  if (sender.login && /\[bot\]$/i.test(sender.login)) return true;
  return false;
}

export function isCommentFixerWebhookEvent(eventName: string, action: string): boolean {
  return (
    (eventName === "pull_request_review" && action === "submitted") ||
    (eventName === "pull_request_review_comment" && action === "created")
  );
}

export function shouldTriggerCommentFixerForReview(
  input: ReviewFixerTriggerInput,
  botLogin: string | null,
): boolean {
  const review = input.review;
  if (!review) return false;

  const state = (review.state ?? "").toLowerCase();
  if (state !== "commented" && state !== "changes_requested") return false;
  if (isFixerContent(review.body)) return false;

  const sender = input.sender;
  if (isOpenHarnessBotSender(sender, botLogin)) return true;
  if (isAutomationSender(sender)) return false;
  return true;
}

export function shouldTriggerCommentFixerForReviewComment(
  input: { comment?: { body?: string | null }; sender?: CommentSender },
  botLogin: string | null,
): boolean {
  if (isFixerContent(input.comment?.body)) return false;
  const sender = input.sender;
  if (isOpenHarnessBotSender(sender, botLogin)) return true;
  if (isAutomationSender(sender)) return false;
  return true;
}
