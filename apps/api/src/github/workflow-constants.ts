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
      "When review comments are added, apply fixes locally, push to the PR branch, and resolve threads.",
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
