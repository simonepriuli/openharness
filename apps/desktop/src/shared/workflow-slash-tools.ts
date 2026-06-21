/** Legacy instruction tokens for workflow PR toggles — not offered in the / picker. */
export type WorkflowToolDefinition = {
  id: string;
  label: string;
  description: string;
};

export const WORKFLOW_TOOL_CATALOG: WorkflowToolDefinition[] = [
  {
    id: "pr_comment",
    label: "Comment on Pull Request",
    description: "Post review comments or summaries on the pull request.",
  },
  {
    id: "pr_approve",
    label: "Approve Pull Request",
    description: "Approve the pull request when it meets the bar.",
  },
  {
    id: "pr_push",
    label: "Push commits to PR branch",
    description: "Push commits to the pull request branch to address feedback.",
  },
];

export const WORKFLOW_TOOL_GUIDELINES: Record<string, string[]> = {
  pr_comment: [
    "The workflow can comment on the pull request after your run.",
    "Summarize findings clearly when review feedback or a PR comment is appropriate.",
    "Use the structured review JSON format when posting inline review comments.",
  ],
  pr_approve: [
    "The workflow can approve the pull request after your run.",
    "Only recommend approval when the change meets the workflow criteria.",
    "Return a review decision of approve when you are confident the PR is ready.",
  ],
  pr_push: [
    "The workflow can push commits to the pull request branch.",
    "Make focused commits in the worktree when fixing issues raised in review.",
    "Do not push unrelated changes.",
  ],
};

export function isWorkflowToolId(toolId: string): boolean {
  return WORKFLOW_TOOL_CATALOG.some((entry) => entry.id === toolId);
}
