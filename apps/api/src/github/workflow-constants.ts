export const WORKFLOW_TYPES = ["pr_review", "comment_fixer"] as const;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export const DEFAULT_WORKFLOW_DEFINITIONS: Array<{
  type: WorkflowType;
  title: string;
  description: string;
}> = [
  {
    type: "pr_review",
    title: "PR review",
    description:
      "When a pull request opens or updates, review the diff and comment on issues or approve if clean.",
  },
  {
    type: "comment_fixer",
    title: "Comment fixer",
    description:
      "When inline review comments are added on changed lines, apply fixes locally, push to the PR branch, and resolve threads.",
  },
];

export const MAX_WORKFLOW_ITERATIONS = 5;
export const FIXER_MARKER = "<!-- openharness:fixer -->";
export const FIXER_COMMIT_TRAILER = "OpenHarness-Workflow: fixer";

export const PR_REVIEW_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "synchronize",
]);

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
  return eventName === "pull_request_review" && action === "submitted";
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
