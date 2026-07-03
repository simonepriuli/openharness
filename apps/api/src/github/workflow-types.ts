import type {
  CveVulnerability,
  WorkflowRunResultPayload,
  WorkflowTools,
} from "@openharness/shared/workflow-run";
import { parseModelRef } from "@openharness/shared/workflow-run";

export type { CveVulnerability, WorkflowRunResultPayload, WorkflowTools };
export { parseModelRef };

export const WORKFLOW_TRIGGER_EVENTS = [
  "pr_opened",
  "pr_updated",
  "pr_ready",
  "pr_comment_on_diff",
  "review_submitted",
] as const;

export type WorkflowTriggerEvent = (typeof WORKFLOW_TRIGGER_EVENTS)[number];

export const WORKFLOW_SCHEDULE_PRESETS = ["hourly", "daily", "weekly"] as const;
export type WorkflowSchedulePreset = (typeof WORKFLOW_SCHEDULE_PRESETS)[number];

export type WorkflowGitPrTrigger = {
  id: string;
  kind: "git_pr";
  event: WorkflowTriggerEvent;
  filters?: {
    commentAuthor?: "anyone" | "non_bot";
    prAuthor?: "anyone";
  };
};

export type WorkflowTeamsMentionTrigger = {
  id: string;
  kind: "teams_mention";
};

export type WorkflowDiscordMentionTrigger = {
  id: string;
  kind: "discord_mention";
};

export type WorkflowScheduleTrigger = {
  id: string;
  kind: "schedule";
  preset?: WorkflowSchedulePreset;
  cronExpression: string;
  timezone: string;
  label?: string;
};

export const LINEAR_TRIGGER_EVENTS = [
  "linear_issue_created",
  "linear_issue_updated",
  "linear_comment_created",
] as const;

export type LinearTriggerEvent = (typeof LINEAR_TRIGGER_EVENTS)[number];

export type WorkflowLinearTrigger = {
  id: string;
  kind: "linear";
  event: LinearTriggerEvent;
  filters?: {
    projectId?: string;
    teamId?: string;
    labelIds?: string[];
  };
};

export type WorkflowTrigger =
  | WorkflowGitPrTrigger
  | WorkflowScheduleTrigger
  | WorkflowTeamsMentionTrigger
  | WorkflowDiscordMentionTrigger
  | WorkflowLinearTrigger;

export type WorkflowTemplateId =
  | "pr_review"
  | "comment_fixer"
  | "dependency_cve_scan"
  | "teams_bug_triage"
  | "discord_bug_triage";

export type WorkflowRecord = {
  id: string;
  connectionId: string;
  userId: string;
  name: string;
  enabled: boolean;
  localOnly: boolean;
  executionTarget: "local" | "cloud" | "auto";
  model: string;
  instructions: string;
  targetBranch: string;
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
  resolvedExecutor: "cloud" | "local";
  runnerKind: "desktop" | "cloud" | null;
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
};

export type WorkflowRunDetail = WorkflowRunSummary & {
  resultMarkdown: string | null;
  resultPayload: WorkflowRunResultPayload | null;
};

export const DEFAULT_WORKFLOW_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  prCreate: false,
  teamsNotify: false,
  discordNotify: false,
};

export const DEFAULT_WORKFLOW_TIMEZONE = "UTC";

function isGitPrTrigger(value: unknown): value is WorkflowGitPrTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowGitPrTrigger;
  return (
    typeof row.id === "string" &&
    row.kind === "git_pr" &&
    WORKFLOW_TRIGGER_EVENTS.includes(row.event)
  );
}

function isTeamsMentionTrigger(value: unknown): value is WorkflowTeamsMentionTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowTeamsMentionTrigger;
  return typeof row.id === "string" && row.kind === "teams_mention";
}

function isDiscordMentionTrigger(value: unknown): value is WorkflowDiscordMentionTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowDiscordMentionTrigger;
  return typeof row.id === "string" && row.kind === "discord_mention";
}

function isLinearTrigger(value: unknown): value is WorkflowLinearTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowLinearTrigger;
  if (typeof row.id !== "string" || row.kind !== "linear") return false;
  if (!LINEAR_TRIGGER_EVENTS.includes(row.event)) return false;
  if (row.filters !== undefined) {
    if (!row.filters || typeof row.filters !== "object") return false;
    const filters = row.filters;
    if (filters.projectId !== undefined && typeof filters.projectId !== "string") return false;
    if (filters.teamId !== undefined && typeof filters.teamId !== "string") return false;
    if (
      filters.labelIds !== undefined &&
      (!Array.isArray(filters.labelIds) ||
        filters.labelIds.some((entry) => typeof entry !== "string"))
    ) {
      return false;
    }
  }
  return true;
}

function isScheduleTrigger(value: unknown): value is WorkflowScheduleTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowScheduleTrigger;
  if (typeof row.id !== "string" || row.kind !== "schedule") return false;
  if (typeof row.cronExpression !== "string" || !row.cronExpression.trim()) return false;
  if (typeof row.timezone !== "string" || !row.timezone.trim()) return false;
  if (row.preset !== undefined && !WORKFLOW_SCHEDULE_PRESETS.includes(row.preset)) return false;
  if (row.label !== undefined && typeof row.label !== "string") return false;
  return true;
}

export function isWorkflowTrigger(value: unknown): value is WorkflowTrigger {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowTrigger;
  if (row.kind === "git_pr") return isGitPrTrigger(row);
  if (row.kind === "schedule") return isScheduleTrigger(row);
  if (row.kind === "teams_mention") return isTeamsMentionTrigger(row);
  if (row.kind === "discord_mention") return isDiscordMentionTrigger(row);
  if (row.kind === "linear") return isLinearTrigger(row);
  return false;
}

export function isScheduleOnlyWorkflow(triggers: WorkflowTrigger[]): boolean {
  return triggers.length > 0 && triggers.every((trigger) => trigger.kind === "schedule");
}

export function isWorkflowTools(value: unknown): value is WorkflowTools {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkflowTools;
  return (
    typeof row.prComment === "boolean" &&
    typeof row.prApprove === "boolean" &&
    typeof row.prPush === "boolean" &&
    (row.prCreate === undefined || typeof row.prCreate === "boolean") &&
    (row.teamsNotify === undefined || typeof row.teamsNotify === "boolean") &&
    (row.discordNotify === undefined || typeof row.discordNotify === "boolean") &&
    (row.linearRead === undefined || typeof row.linearRead === "boolean") &&
    (row.linearWrite === undefined || typeof row.linearWrite === "boolean") &&
    (row.linearComments === undefined || typeof row.linearComments === "boolean")
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

export function scheduleTriggerLabel(trigger: WorkflowScheduleTrigger): string {
  if (trigger.label?.trim()) return trigger.label.trim();
  if (trigger.preset === "hourly") return "Hourly";
  if (trigger.preset === "daily") return "Daily";
  if (trigger.preset === "weekly") return "Weekly";
  return `Cron: ${trigger.cronExpression}`;
}

export function triggerLabel(trigger: WorkflowTrigger): string {
  if (trigger.kind === "git_pr") return triggerEventLabel(trigger.event);
  if (trigger.kind === "teams_mention") return "Teams @mention";
  if (trigger.kind === "discord_mention") return "Discord mention";
  if (trigger.kind === "linear") {
    switch (trigger.event) {
      case "linear_issue_created":
        return "Linear issue created";
      case "linear_issue_updated":
        return "Linear issue updated";
      case "linear_comment_created":
        return "Linear comment created";
    }
  }
  if (trigger.kind === "schedule") {
    return scheduleTriggerLabel(trigger);
  }
  return "Trigger";
}

export function cronExpressionForPreset(
  preset: WorkflowSchedulePreset,
  options?: { hour?: number; minute?: number; dayOfWeek?: number },
): string {
  const minute = options?.minute ?? 0;
  const hour = options?.hour ?? 9;
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly": {
      const day = options?.dayOfWeek ?? 1;
      return `${minute} ${hour} * * ${day}`;
    }
    default:
      return `${minute} ${hour} * * *`;
  }
}
