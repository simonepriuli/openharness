// openharness-linear-actions-version:1
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readLinearActionsConfig } from "./config.js";
import {
  assignLinearIssue,
  createLinearComment,
  createLinearIssue,
  getLinearIssue,
  linkLinearIssue,
  listLinearComments,
  listLinearCycles,
  listLinearLabels,
  listLinearProjects,
  listLinearTeams,
  searchLinearIssues,
  updateLinearIssue,
  updateLinearIssueStatus,
} from "./linear-actions-client.js";

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    details: {},
  };
}

function toolSuccess(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function isEnabled(config: ReturnType<typeof readLinearActionsConfig>, toolName: string): boolean {
  return Boolean(config?.enabledTools.has(toolName));
}

export default function openharnessLinearActions(pi: ExtensionAPI) {
  const config = readLinearActionsConfig();
  if (!config) return;

  pi.registerTool({
    name: "search_linear_issues",
    label: "Search Linear Issues",
    description: "Search and list Linear issues, optionally filtered by team or project.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Text to match in title, identifier, or description" })),
      team_id: Type.Optional(Type.String({ description: "Linear team ID" })),
      project_id: Type.Optional(Type.String({ description: "Linear project ID" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "search_linear_issues")) {
        return toolError("search_linear_issues is not enabled for this session.");
      }
      try {
        const result = await searchLinearIssues(config, {
          query: params.query,
          teamId: params.team_id,
          projectId: params.project_id,
          limit: params.limit,
        });
        return toolSuccess(JSON.stringify(result.issues, null, 2), { count: result.issues.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "get_linear_issue",
    label: "Get Linear Issue",
    description: "Fetch a Linear issue by ID or identifier (e.g. ENG-123).",
    parameters: Type.Object({
      issue_id: Type.Optional(Type.String({ description: "Linear issue UUID" })),
      identifier: Type.Optional(Type.String({ description: "Human-readable issue identifier" })),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "get_linear_issue")) {
        return toolError("get_linear_issue is not enabled for this session.");
      }
      if (!params.issue_id && !params.identifier) {
        return toolError("Provide issue_id or identifier.");
      }
      try {
        const result = await getLinearIssue(config, {
          issueId: params.issue_id,
          identifier: params.identifier,
        });
        return toolSuccess(JSON.stringify(result.issue, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "list_linear_projects",
    label: "List Linear Projects",
    description: "List Linear projects in the connected workspace.",
    parameters: Type.Object({}),
    async execute() {
      if (!isEnabled(config, "list_linear_projects")) {
        return toolError("list_linear_projects is not enabled for this session.");
      }
      try {
        const result = await listLinearProjects(config);
        return toolSuccess(JSON.stringify(result.projects, null, 2), { count: result.projects.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "list_linear_teams",
    label: "List Linear Teams",
    description: "List Linear teams in the connected workspace.",
    parameters: Type.Object({}),
    async execute() {
      if (!isEnabled(config, "list_linear_teams")) {
        return toolError("list_linear_teams is not enabled for this session.");
      }
      try {
        const result = await listLinearTeams(config);
        return toolSuccess(JSON.stringify(result.teams, null, 2), { count: result.teams.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "list_linear_cycles",
    label: "List Linear Cycles",
    description: "List Linear cycles, optionally filtered by team.",
    parameters: Type.Object({
      team_id: Type.Optional(Type.String({ description: "Linear team ID" })),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "list_linear_cycles")) {
        return toolError("list_linear_cycles is not enabled for this session.");
      }
      try {
        const result = await listLinearCycles(config, params.team_id);
        return toolSuccess(JSON.stringify(result.cycles, null, 2), { count: result.cycles.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "list_linear_labels",
    label: "List Linear Labels",
    description: "List Linear issue labels, optionally filtered by team.",
    parameters: Type.Object({
      team_id: Type.Optional(Type.String({ description: "Linear team ID" })),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "list_linear_labels")) {
        return toolError("list_linear_labels is not enabled for this session.");
      }
      try {
        const result = await listLinearLabels(config, params.team_id);
        return toolSuccess(JSON.stringify(result.labels, null, 2), { count: result.labels.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "create_linear_issue",
    label: "Create Linear Issue",
    description: "Create a new Linear issue in a team.",
    parameters: Type.Object({
      team_id: Type.String({ description: "Linear team ID" }),
      title: Type.String({ description: "Issue title" }),
      description: Type.Optional(Type.String({ description: "Issue description (markdown)" })),
      project_id: Type.Optional(Type.String({ description: "Linear project ID" })),
      priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 4 })),
      label_ids: Type.Optional(Type.Array(Type.String())),
      assignee_id: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "create_linear_issue")) {
        return toolError("create_linear_issue is not enabled for this session.");
      }
      try {
        const result = await createLinearIssue(config, {
          teamId: params.team_id,
          title: params.title,
          description: params.description,
          projectId: params.project_id,
          priority: params.priority,
          labelIds: params.label_ids,
          assigneeId: params.assignee_id,
        });
        return toolSuccess(JSON.stringify(result.issue, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "update_linear_issue",
    label: "Update Linear Issue",
    description: "Update title, description, priority, project, or labels on a Linear issue.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 4 })),
      project_id: Type.Optional(Type.String()),
      label_ids: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "update_linear_issue")) {
        return toolError("update_linear_issue is not enabled for this session.");
      }
      try {
        const result = await updateLinearIssue(config, params.issue_id, {
          title: params.title,
          description: params.description,
          priority: params.priority,
          projectId: params.project_id,
          labelIds: params.label_ids,
        });
        return toolSuccess(JSON.stringify(result.issue, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "assign_linear_issue",
    label: "Assign Linear Issue",
    description: "Assign or unassign a Linear issue.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
      assignee_id: Type.Optional(
        Type.Union([Type.String(), Type.Null()], { description: "User ID or null to unassign" }),
      ),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "assign_linear_issue")) {
        return toolError("assign_linear_issue is not enabled for this session.");
      }
      try {
        const result = await assignLinearIssue(config, params.issue_id, params.assignee_id ?? null);
        return toolSuccess(JSON.stringify(result.issue, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "update_linear_issue_status",
    label: "Update Linear Issue Status",
    description: "Move a Linear issue to a workflow state.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
      state_id: Type.String({ description: "Workflow state ID" }),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "update_linear_issue_status")) {
        return toolError("update_linear_issue_status is not enabled for this session.");
      }
      try {
        const result = await updateLinearIssueStatus(config, params.issue_id, params.state_id);
        return toolSuccess(JSON.stringify(result.issue, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "link_linear_issue",
    label: "Link URL to Linear Issue",
    description: "Attach an external URL (e.g. pull request) to a Linear issue.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
      url: Type.String({ description: "URL to attach" }),
      title: Type.Optional(Type.String({ description: "Link title" })),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "link_linear_issue")) {
        return toolError("link_linear_issue is not enabled for this session.");
      }
      try {
        const result = await linkLinearIssue(config, params.issue_id, params.url, params.title);
        return toolSuccess(JSON.stringify(result.attachment, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "list_linear_comments",
    label: "List Linear Comments",
    description: "List comments on a Linear issue.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "list_linear_comments")) {
        return toolError("list_linear_comments is not enabled for this session.");
      }
      try {
        const result = await listLinearComments(config, params.issue_id);
        return toolSuccess(JSON.stringify(result.comments, null, 2), { count: result.comments.length });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  pi.registerTool({
    name: "create_linear_comment",
    label: "Create Linear Comment",
    description: "Add a comment to a Linear issue.",
    parameters: Type.Object({
      issue_id: Type.String({ description: "Linear issue UUID" }),
      body: Type.String({ description: "Comment body (markdown)" }),
    }),
    async execute(_id, params) {
      if (!isEnabled(config, "create_linear_comment")) {
        return toolError("create_linear_comment is not enabled for this session.");
      }
      try {
        const result = await createLinearComment(config, params.issue_id, params.body);
        return toolSuccess(JSON.stringify(result.comment, null, 2));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  });
}
