import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { WorkflowRunExecutionRecord, WorkflowTools } from "@openharness/shared/workflow-run";
import type { CloudWorkerConfig } from "./config.js";

const LINEAR_READ_TOOLS = [
  "search_linear_issues",
  "get_linear_issue",
  "list_linear_projects",
  "list_linear_teams",
  "list_linear_cycles",
  "list_linear_labels",
] as const;

const LINEAR_WRITE_TOOLS = [
  "create_linear_issue",
  "update_linear_issue",
  "assign_linear_issue",
  "update_linear_issue_status",
  "link_linear_issue",
] as const;

const LINEAR_COMMENT_TOOLS = ["list_linear_comments", "create_linear_comment"] as const;

function enabledLinearToolsFromWorkflowToggles(tools: WorkflowTools): string[] {
  const enabled: string[] = [];
  if (tools.linearRead) enabled.push(...LINEAR_READ_TOOLS);
  if (tools.linearWrite) enabled.push(...LINEAR_WRITE_TOOLS);
  if (tools.linearComments) enabled.push(...LINEAR_COMMENT_TOOLS);
  return enabled;
}

export function buildCloudLinearActionsEnv(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  runId: string;
  enabledTools: string[];
}): NodeJS.ProcessEnv {
  if (options.enabledTools.length === 0) {
    return {};
  }

  mkdirSync(join(tmpdir(), "openharness-linear-actions"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-linear-actions", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      kind: "cloud_worker",
      baseUrl: options.baseUrl,
      secret: options.secret,
      organizationId: options.organizationId,
      workflowRunId: options.runId,
    }),
    "utf8",
  );

  return {
    OPENHARNESS_LINEAR_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_LINEAR_TOOLS: options.enabledTools.join(","),
    OPENHARNESS_WORKFLOW_RUN_ID: options.runId,
  };
}

export async function buildWorkflowLinearActionsEnv(
  config: CloudWorkerConfig,
  organizationId: string,
  _run: WorkflowRunExecutionRecord,
  tools: WorkflowTools,
  runId: string,
): Promise<NodeJS.ProcessEnv> {
  const enabledTools = enabledLinearToolsFromWorkflowToggles(tools);
  if (enabledTools.length === 0) return {};
  return buildCloudLinearActionsEnv({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    runId,
    enabledTools,
  });
}
