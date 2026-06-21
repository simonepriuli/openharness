export const WORKFLOW_TRIGGER_EVENTS = [
  "pr_opened",
  "pr_updated",
  "pr_ready",
  "pr_comment_on_diff",
  "review_submitted",
] as const;

export type WorkflowTriggerEvent = (typeof WORKFLOW_TRIGGER_EVENTS)[number];

export type WorkflowTrigger = {
  id: string;
  kind: "git_pr";
  event: WorkflowTriggerEvent;
  filters?: {
    commentAuthor?: "anyone" | "non_bot";
    prAuthor?: "anyone";
  };
};

export type WorkflowTools = {
  memories: boolean;
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
};

export type WorkflowTemplateId = "pr_review" | "comment_fixer";

export type WorkflowRecord = {
  id: string;
  connectionId: string;
  name: string;
  enabled: boolean;
  model: string;
  instructions: string;
  triggers: WorkflowTrigger[];
  tools: WorkflowTools;
  fullName: string;
  owner: string;
  repo: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  model: string;
  instructions: string;
  triggers: WorkflowTrigger[];
  tools: WorkflowTools;
};

export type WorkflowRunSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerLabel: string;
  event: string;
  prNumber: number;
  status: string;
  errorMessage: string | null;
  iteration: number;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
};

export const DEFAULT_WORKFLOW_TOOLS: WorkflowTools = {
  memories: true,
  prComment: false,
  prApprove: false,
  prPush: false,
};

export function parseModelRef(model: string): { provider: string; modelId: string } | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

export function isWorkflowTrigger(value: unknown): value is WorkflowTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowTrigger;
  return (
    typeof row.id === "string" &&
    row.kind === "git_pr" &&
    WORKFLOW_TRIGGER_EVENTS.includes(row.event)
  );
}

export function isWorkflowTools(value: unknown): value is WorkflowTools {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowTools;
  return (
    typeof row.memories === "boolean" &&
    typeof row.prComment === "boolean" &&
    typeof row.prApprove === "boolean" &&
    typeof row.prPush === "boolean"
  );
}

export function triggerEventLabel(event: WorkflowTriggerEvent): string {
  switch (event) {
    case "pr_opened":
      return "PR opened";
    case "pr_updated":
      return "PR updated";
    case "pr_ready":
      return "PR ready for review";
    case "pr_comment_on_diff":
      return "Comment on PR diff";
    case "review_submitted":
      return "Review submitted";
    default:
      return event;
  }
}
