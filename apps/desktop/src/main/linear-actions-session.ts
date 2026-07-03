import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getApiBaseUrl } from "./auth-config.js";
import { getExtensionApiAuth } from "./openharness-api.js";
import {
  enabledLinearToolsFromWorkflowToggles,
  LINEAR_ACTION_TOOL_NAMES,
  type LinearActionToolName,
  type LinearWorkflowToolToggles,
} from "./linear-actions-mappings.js";

export {
  enabledLinearToolsFromWorkflowToggles,
  LINEAR_ACTION_TOOL_NAMES,
  type LinearActionToolName,
  type LinearWorkflowToolToggles,
  LINEAR_READ_TOOL_NAMES,
  LINEAR_WRITE_TOOL_NAMES,
  LINEAR_COMMENT_TOOL_NAMES,
} from "./linear-actions-mappings.js";

const authFiles = new Set<string>();

export async function buildLinearActionsEnv(options: {
  enabledTools: LinearActionToolName[];
  workflowRunId?: string;
}): Promise<NodeJS.ProcessEnv> {
  if (options.enabledTools.length === 0) {
    return {};
  }

  const auth = await getExtensionApiAuth();
  mkdirSync(join(tmpdir(), "openharness-linear-actions"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-linear-actions", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      baseUrl: getApiBaseUrl(),
      cookie: auth.cookie,
      sessionToken: auth.sessionToken,
      ...(options.workflowRunId ? { workflowRunId: options.workflowRunId } : {}),
    }),
    "utf8",
  );
  authFiles.add(authFile);

  return {
    OPENHARNESS_LINEAR_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_LINEAR_TOOLS: options.enabledTools.join(","),
    ...(options.workflowRunId ? { OPENHARNESS_WORKFLOW_RUN_ID: options.workflowRunId } : {}),
  };
}

export async function buildLinearActionsEnvForChat(): Promise<NodeJS.ProcessEnv> {
  return buildLinearActionsEnv({
    enabledTools: [...LINEAR_ACTION_TOOL_NAMES],
  });
}

export function releaseLinearActionsAuthFile(env: NodeJS.ProcessEnv): void {
  const authFile = env.OPENHARNESS_LINEAR_AUTH_FILE;
  if (!authFile || !authFiles.has(authFile)) return;
  authFiles.delete(authFile);
  try {
    rmSync(authFile, { force: true });
  } catch {
    // ignore
  }
}

export function enabledToolsFromWorkflowToggles(tools: LinearWorkflowToolToggles) {
  return enabledLinearToolsFromWorkflowToggles(tools);
}
