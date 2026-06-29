import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { WorkflowRunExecutionRecord, WorkflowTools } from "@openharness/shared/workflow-run";

const WORKFLOW_NOTIFY_TOOL_NAMES = ["post_discord_message", "post_teams_message"] as const;

type WorkflowNotifyToolName = (typeof WORKFLOW_NOTIFY_TOOL_NAMES)[number];

function enabledNotifyToolsFromWorkflowToggles(tools: WorkflowTools): WorkflowNotifyToolName[] {
  const enabled: WorkflowNotifyToolName[] = [];
  if (tools.discordNotify) enabled.push("post_discord_message");
  if (tools.teamsNotify) enabled.push("post_teams_message");
  return enabled;
}

export function buildCloudWorkflowNotifyEnv(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  runId: string;
  enabledTools: WorkflowNotifyToolName[];
}): NodeJS.ProcessEnv {
  if (options.enabledTools.length === 0) {
    return {};
  }

  mkdirSync(join(tmpdir(), "openharness-workflow-notify"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-workflow-notify", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      kind: "cloud_worker",
      baseUrl: options.baseUrl,
      secret: options.secret,
      organizationId: options.organizationId,
    }),
    "utf8",
  );

  return {
    OPENHARNESS_WORKFLOW_RUN_ID: options.runId,
    OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_NOTIFY_TOOLS: options.enabledTools.join(","),
  };
}

export async function buildWorkflowNotifyEnv(
  config: {
    apiUrl: string;
    secret: string;
  },
  organizationId: string,
  _run: WorkflowRunExecutionRecord,
  tools: WorkflowTools,
  runId: string,
): Promise<NodeJS.ProcessEnv> {
  const enabledTools = enabledNotifyToolsFromWorkflowToggles(tools);
  if (enabledTools.length === 0) return {};
  return buildCloudWorkflowNotifyEnv({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    runId,
    enabledTools,
  });
}
