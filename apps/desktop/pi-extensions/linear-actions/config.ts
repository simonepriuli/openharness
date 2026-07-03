import { readFileSync } from "node:fs";
import type { LinearActionsAuth } from "./auth.js";

export type LinearActionsConfig = {
  enabledTools: Set<string>;
  auth: LinearActionsAuth;
};

function isValidAuth(auth: LinearActionsAuth): boolean {
  if (!auth.baseUrl?.trim()) return false;
  if (auth.kind === "cloud_worker") {
    return Boolean(auth.secret?.trim() && auth.organizationId?.trim());
  }
  return Boolean(auth.cookie?.trim() && auth.sessionToken?.trim());
}

export function readLinearActionsConfig(): LinearActionsConfig | null {
  const authFile = process.env.OPENHARNESS_LINEAR_AUTH_FILE?.trim();
  const enabledRaw = process.env.OPENHARNESS_ENABLED_LINEAR_TOOLS?.trim();
  if (!authFile || !enabledRaw) return null;

  let auth: LinearActionsAuth;
  try {
    auth = JSON.parse(readFileSync(authFile, "utf8")) as LinearActionsAuth;
  } catch {
    return null;
  }
  if (!isValidAuth(auth)) return null;

  const workflowRunId = process.env.OPENHARNESS_WORKFLOW_RUN_ID?.trim();
  if (workflowRunId) {
    auth = { ...auth, workflowRunId };
  }

  const enabledTools = new Set(
    enabledRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  if (enabledTools.size === 0) return null;

  return { enabledTools, auth };
}
