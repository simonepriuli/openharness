/** Workflow GitHub action tokens for the / picker and prompt expansion. */
export type WorkflowToolDefinition = {
  id: string;
  label: string;
  description: string;
};

export const WORKFLOW_TOOL_CATALOG: WorkflowToolDefinition[] = [
  {
    id: "pr_comment",
    label: "Review Pull Request",
    description:
      "Submit a full code review on GitHub: overall feedback plus optional inline notes on specific changed lines.",
  },
  {
    id: "pr_approve",
    label: "Approve Pull Request",
    description: "Mark the pull request approved on GitHub when the changes are ready to merge.",
  },
  {
    id: "pr_create",
    label: "Create Pull Request",
    description: "Open a new pull request on GitHub from the current branch.",
  },
  {
    id: "pr_push",
    label: "Push Branch to GitHub",
    description:
      "Save any uncommitted agent edits as a git commit, then upload the branch to GitHub.",
  },
];

export const WORKFLOW_TOOL_GUIDELINES: Record<string, string[]> = {
  pr_comment: [
    "Call find_open_pull_request first to resolve the target pull request number.",
    "The agent can submit a full pull request review via submit_pull_request_review.",
    "Include a review summary and inline notes on changed lines when requesting changes.",
    "Pass the resolved pr_number to submit_pull_request_review.",
  ],
  pr_approve: [
    "Call find_open_pull_request first to resolve the target pull request number.",
    "The agent can approve pull requests via approve_pull_request.",
    "Only approve when the change meets the workflow criteria.",
    "Pass the resolved pr_number to approve_pull_request.",
  ],
  pr_create: [
    "The agent can open pull requests via create_pull_request.",
    "Push the branch to GitHub first when the remote does not yet have the commits.",
  ],
  pr_push: [
    "The agent can upload local commits via push_branch.",
    "Use after editing files when the changes should appear on the GitHub branch.",
  ],
};

export function workflowToggleKeyForToolId(
  toolId: string,
): "prComment" | "prApprove" | "prPush" | "prCreate" | null {
  switch (toolId) {
    case "pr_comment":
      return "prComment";
    case "pr_approve":
      return "prApprove";
    case "pr_create":
      return "prCreate";
    case "pr_push":
      return "prPush";
    default:
      return null;
  }
}

export function isWorkflowToolId(toolId: string): boolean {
  return WORKFLOW_TOOL_CATALOG.some((entry) => entry.id === toolId);
}
