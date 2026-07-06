import { eq, type Database } from "@openharness/db";
import { Result } from "better-result";
import { linearAgentRun, workflowRun } from "@openharness/db/schema";
import type { WorkflowTools } from "@openharness/shared/workflow-run";
import { ValidationError } from "../errors.js";

export type LinearToolGroup = "read" | "write" | "comments";

const READ_TOOLS = new Set([
  "search_linear_issues",
  "get_linear_issue",
  "list_linear_projects",
  "list_linear_teams",
  "list_linear_cycles",
  "list_linear_labels",
]);

const WRITE_TOOLS = new Set([
  "create_linear_issue",
  "update_linear_issue",
  "assign_linear_issue",
  "update_linear_issue_status",
  "link_linear_issue",
]);

const COMMENT_TOOLS = new Set(["list_linear_comments", "create_linear_comment"]);

export function linearToolGroup(toolName: string): LinearToolGroup | null {
  if (READ_TOOLS.has(toolName)) return "read";
  if (WRITE_TOOLS.has(toolName)) return "write";
  if (COMMENT_TOOLS.has(toolName)) return "comments";
  return null;
}

function isToolGroupEnabled(tools: WorkflowTools, group: LinearToolGroup): boolean {
  if (group === "read") return tools.linearRead === true;
  if (group === "write") return tools.linearWrite === true;
  return tools.linearComments === true;
}

export async function assertLinearToolAllowed(
  db: Database,
  organizationId: string,
  toolName: string,
  workflowRunId?: string | null,
  linearAgentRunId?: string | null,
): Promise<Result<void, ValidationError>> {
  const group = linearToolGroup(toolName);
  if (!group) {
    return Result.err(new ValidationError({ message: `Unknown Linear tool: ${toolName}` }));
  }

  if (linearAgentRunId) {
    const rows = await db
      .select()
      .from(linearAgentRun)
      .where(eq(linearAgentRun.id, linearAgentRunId))
      .limit(1);
    const run = rows[0];
    if (!run || run.organizationId !== organizationId) {
      return Result.err(new ValidationError({ message: "Linear agent run not found." }));
    }
    const payload = (run.payload ?? {}) as {
      agentConfig?: { tools?: WorkflowTools };
    };
    const tools = payload.agentConfig?.tools;
    if (!tools || !isToolGroupEnabled(tools, group)) {
      return Result.err(
        new ValidationError({ message: `Linear ${group} tools are not enabled for this agent.` }),
      );
    }
    return Result.ok(undefined);
  }

  if (!workflowRunId) {
    return Result.ok(undefined);
  }

  const rows = await db
    .select()
    .from(workflowRun)
    .where(eq(workflowRun.id, workflowRunId))
    .limit(1);
  const run = rows[0];
  if (!run || run.organizationId !== organizationId) {
    return Result.err(new ValidationError({ message: "Workflow run not found." }));
  }

  const payload = (run.payload ?? {}) as {
    workflow?: { tools?: WorkflowTools };
  };
  const tools = payload.workflow?.tools;
  if (!tools || !isToolGroupEnabled(tools, group)) {
    return Result.err(
      new ValidationError({ message: `Linear ${group} tools are not enabled for this workflow.` }),
    );
  }
  return Result.ok(undefined);
}

export function enabledLinearToolsFromWorkflowToggles(tools: WorkflowTools): string[] {
  const enabled: string[] = [];
  if (tools.linearRead) {
    enabled.push(...READ_TOOLS);
  }
  if (tools.linearWrite) {
    enabled.push(...WRITE_TOOLS);
  }
  if (tools.linearComments) {
    enabled.push(...COMMENT_TOOLS);
  }
  return [...enabled];
}

export const ALL_LINEAR_CHAT_TOOLS = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...COMMENT_TOOLS,
] as string[];
