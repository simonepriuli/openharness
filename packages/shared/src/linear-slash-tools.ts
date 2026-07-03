/** Individual Linear agent tools for the / picker and prompt expansion. */
export type LinearToolGroup = "read" | "write" | "comments";

export type LinearToolDefinition = {
  id: string;
  label: string;
  description: string;
  group: LinearToolGroup;
};

export const LINEAR_TOOL_CATALOG: LinearToolDefinition[] = [
  {
    id: "search_linear_issues",
    label: "Search Linear Issues",
    description: "Search and list Linear issues, optionally filtered by team or project.",
    group: "read",
  },
  {
    id: "get_linear_issue",
    label: "Get Linear Issue",
    description: "Fetch a Linear issue by ID or identifier (e.g. ENG-123).",
    group: "read",
  },
  {
    id: "list_linear_projects",
    label: "List Linear Projects",
    description: "List Linear projects in the connected workspace.",
    group: "read",
  },
  {
    id: "list_linear_teams",
    label: "List Linear Teams",
    description: "List Linear teams in the connected workspace.",
    group: "read",
  },
  {
    id: "list_linear_cycles",
    label: "List Linear Cycles",
    description: "List Linear cycles, optionally filtered by team.",
    group: "read",
  },
  {
    id: "list_linear_labels",
    label: "List Linear Labels",
    description: "List Linear issue labels, optionally filtered by team.",
    group: "read",
  },
  {
    id: "create_linear_issue",
    label: "Create Linear Issue",
    description: "Create a new Linear issue in a team.",
    group: "write",
  },
  {
    id: "update_linear_issue",
    label: "Update Linear Issue",
    description: "Update title, description, priority, project, or labels on a Linear issue.",
    group: "write",
  },
  {
    id: "assign_linear_issue",
    label: "Assign Linear Issue",
    description: "Assign or unassign a Linear issue.",
    group: "write",
  },
  {
    id: "update_linear_issue_status",
    label: "Update Linear Issue Status",
    description: "Move a Linear issue to a workflow state.",
    group: "write",
  },
  {
    id: "link_linear_issue",
    label: "Link URL to Linear Issue",
    description: "Attach an external URL (e.g. pull request) to a Linear issue.",
    group: "write",
  },
  {
    id: "list_linear_comments",
    label: "List Linear Comments",
    description: "List comments on a Linear issue.",
    group: "comments",
  },
  {
    id: "create_linear_comment",
    label: "Create Linear Comment",
    description: "Add a comment to a Linear issue.",
    group: "comments",
  },
];

export function isLinearToolId(toolId: string): boolean {
  return LINEAR_TOOL_CATALOG.some((entry) => entry.id === toolId);
}

export function linearToolToggleKeyForToolId(
  toolId: string,
): "linearRead" | "linearWrite" | "linearComments" | null {
  const entry = LINEAR_TOOL_CATALOG.find((item) => item.id === toolId);
  if (!entry) return null;
  switch (entry.group) {
    case "read":
      return "linearRead";
    case "write":
      return "linearWrite";
    case "comments":
      return "linearComments";
  }
}

export function linearToolGuidelinesForToolId(toolId: string): string[] | null {
  const entry = LINEAR_TOOL_CATALOG.find((item) => item.id === toolId);
  if (!entry) return null;
  return [
    `The user enabled ${entry.label} for this message.`,
    entry.description,
    `Use the ${entry.id} tool when needed.`,
  ];
}
