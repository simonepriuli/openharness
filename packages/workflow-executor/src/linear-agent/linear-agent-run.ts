import type { WorkflowTools } from "@openharness/shared/workflow-run";

export type LinearAgentConfigSnapshot = {
  model: string;
  instructions: string;
  tools: WorkflowTools;
  targetBranch: string;
};

export type LinearAgentRunExecutionRecord = {
  id: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  mappingId: string | null;
  projectSourceControlConnectionId?: string | null;
  connectionId?: string | null;
  provider: "github" | "azure_devops";
  namespace: string;
  repoName: string;
  trigger: "delegated" | "mentioned" | "prompted";
  payload: Record<string, unknown>;
  createdAt: string;
};

export function extractLinearAgentConfig(
  run: LinearAgentRunExecutionRecord,
): LinearAgentConfigSnapshot | null {
  const agentConfig = run.payload.agentConfig;
  if (!agentConfig || typeof agentConfig !== "object") return null;
  const row = agentConfig as Partial<LinearAgentConfigSnapshot & { tools?: WorkflowTools }>;
  if (!row.tools) return null;
  return {
    model: typeof row.model === "string" ? row.model : "",
    instructions: typeof row.instructions === "string" ? row.instructions : "",
    targetBranch: typeof row.targetBranch === "string" ? row.targetBranch : "main",
    tools: row.tools,
  };
}

export function linearAgentTargetBranch(run: LinearAgentRunExecutionRecord): string {
  const fromPayload =
    typeof run.payload.targetBranch === "string" ? run.payload.targetBranch.trim() : "";
  if (fromPayload) return fromPayload;
  const config = extractLinearAgentConfig(run);
  return config?.targetBranch?.trim() || "main";
}
