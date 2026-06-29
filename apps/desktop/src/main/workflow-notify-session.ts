import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getApiBaseUrl } from "./auth-config.js";
import { getExtensionApiAuth } from "./openharness-api.js";
import type { WorkflowNotifyToolName } from "./workflow-notify-mappings.js";

export {
  enabledNotifyToolsFromWorkflowToggles,
  WORKFLOW_NOTIFY_TOOL_NAMES,
  type WorkflowNotifyToolName,
} from "./workflow-notify-mappings.js";

const authFiles = new Set<string>();

export async function buildWorkflowNotifyEnv(options: {
  runId: string;
  enabledTools: WorkflowNotifyToolName[];
}): Promise<NodeJS.ProcessEnv> {
  if (options.enabledTools.length === 0) {
    return {};
  }

  const auth = await getExtensionApiAuth();
  mkdirSync(join(tmpdir(), "openharness-workflow-notify"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-workflow-notify", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      baseUrl: getApiBaseUrl(),
      cookie: auth.cookie,
      sessionToken: auth.sessionToken,
    }),
    "utf8",
  );
  authFiles.add(authFile);

  return {
    OPENHARNESS_WORKFLOW_RUN_ID: options.runId,
    OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_NOTIFY_TOOLS: options.enabledTools.join(","),
  };
}

export function cleanupWorkflowNotifyAuthFiles(): void {
  for (const file of authFiles) {
    try {
      rmSync(file, { force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  authFiles.clear();
}

export function releaseWorkflowNotifyAuthFile(env: NodeJS.ProcessEnv | undefined): void {
  const file = env?.OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE;
  if (!file) return;
  try {
    rmSync(file, { force: true });
  } catch {
    // ignore cleanup errors
  }
  authFiles.delete(file);
}
