export const GITHUB_ACTION_TOOL_NAMES = [
  "approve_pull_request",
  "submit_pull_request_review",
  "create_pull_request",
  "push_branch",
] as const;

export type GithubActionToolName = (typeof GITHUB_ACTION_TOOL_NAMES)[number];

export type GithubWorkflowToolToggles = {
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
  prCreate: boolean;
};

export function enabledToolsFromWorkflowToggles(
  tools: GithubWorkflowToolToggles,
): GithubActionToolName[] {
  const enabled: GithubActionToolName[] = [];
  if (tools.prApprove) enabled.push("approve_pull_request");
  if (tools.prComment) enabled.push("submit_pull_request_review");
  if (tools.prCreate) enabled.push("create_pull_request");
  if (tools.prPush) enabled.push("push_branch");
  return enabled;
}

export function workflowToolIdForGithubAction(
  toolName: GithubActionToolName,
): keyof GithubWorkflowToolToggles | null {
  switch (toolName) {
    case "approve_pull_request":
      return "prApprove";
    case "submit_pull_request_review":
      return "prComment";
    case "create_pull_request":
      return "prCreate";
    case "push_branch":
      return "prPush";
    default:
      return null;
  }
}

export function githubActionToolForWorkflowToolId(
  toolId: string,
): GithubActionToolName | null {
  switch (toolId) {
    case "pr_approve":
      return "approve_pull_request";
    case "pr_comment":
      return "submit_pull_request_review";
    case "pr_create":
      return "create_pull_request";
    case "pr_push":
      return "push_branch";
    default:
      return null;
  }
}
