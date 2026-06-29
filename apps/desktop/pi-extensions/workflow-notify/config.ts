import { readFileSync } from "node:fs";
import type { WorkflowNotifyAuth } from "./auth.js";

export type WorkflowNotifyConfig = {
  runId: string;
  enabledTools: Set<string>;
  auth: WorkflowNotifyAuth;
};

function isValidAuth(auth: WorkflowNotifyAuth): boolean {
  if (!auth.baseUrl?.trim()) return false;
  if (auth.kind === "cloud_worker") {
    return Boolean(auth.secret?.trim() && auth.organizationId?.trim());
  }
  return Boolean(auth.cookie?.trim() && auth.sessionToken?.trim());
}

export function readWorkflowNotifyConfig(): WorkflowNotifyConfig | null {
  const runId = process.env.OPENHARNESS_WORKFLOW_RUN_ID?.trim();
  const authFile = process.env.OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE?.trim();
  const enabledRaw = process.env.OPENHARNESS_ENABLED_NOTIFY_TOOLS?.trim();
  if (!runId || !authFile || !enabledRaw) return null;

  let auth: WorkflowNotifyAuth;
  try {
    auth = JSON.parse(readFileSync(authFile, "utf8")) as WorkflowNotifyAuth;
  } catch {
    return null;
  }
  if (!isValidAuth(auth)) return null;

  const enabledTools = new Set(
    enabledRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  if (enabledTools.size === 0) return null;

  return { runId, enabledTools, auth };
}
