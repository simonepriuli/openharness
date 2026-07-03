export const LINEAR_READ_TOOL_NAMES = [
  "search_linear_issues",
  "get_linear_issue",
  "list_linear_projects",
  "list_linear_teams",
  "list_linear_cycles",
  "list_linear_labels",
] as const;

export const LINEAR_WRITE_TOOL_NAMES = [
  "create_linear_issue",
  "update_linear_issue",
  "assign_linear_issue",
  "update_linear_issue_status",
  "link_linear_issue",
] as const;

export const LINEAR_COMMENT_TOOL_NAMES = [
  "list_linear_comments",
  "create_linear_comment",
] as const;

export const LINEAR_ACTION_TOOL_NAMES = [
  ...LINEAR_READ_TOOL_NAMES,
  ...LINEAR_WRITE_TOOL_NAMES,
  ...LINEAR_COMMENT_TOOL_NAMES,
] as const;

export type LinearActionToolName = (typeof LINEAR_ACTION_TOOL_NAMES)[number];

export type LinearWorkflowToolToggles = {
  linearRead?: boolean;
  linearWrite?: boolean;
  linearComments?: boolean;
};

export function enabledLinearToolsFromWorkflowToggles(
  tools: LinearWorkflowToolToggles,
): LinearActionToolName[] {
  const enabled: LinearActionToolName[] = [];
  if (tools.linearRead) enabled.push(...LINEAR_READ_TOOL_NAMES);
  if (tools.linearWrite) enabled.push(...LINEAR_WRITE_TOOL_NAMES);
  if (tools.linearComments) enabled.push(...LINEAR_COMMENT_TOOL_NAMES);
  return enabled;
}

export function workflowToolIdForLinearGroup(
  group: "linear_read" | "linear_write" | "linear_comments",
): keyof LinearWorkflowToolToggles | null {
  switch (group) {
    case "linear_read":
      return "linearRead";
    case "linear_write":
      return "linearWrite";
    case "linear_comments":
      return "linearComments";
    default:
      return null;
  }
}

export function linearGroupForWorkflowToolId(
  toolId: string,
): "linear_read" | "linear_write" | "linear_comments" | null {
  switch (toolId) {
    case "linear_read":
      return "linear_read";
    case "linear_write":
      return "linear_write";
    case "linear_comments":
      return "linear_comments";
    default:
      return null;
  }
}
