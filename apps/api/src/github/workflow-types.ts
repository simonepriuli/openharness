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

export type WorkflowTrigger =
  | WorkflowGitPrTrigger
  | WorkflowScheduleTrigger
  | WorkflowTeamsMentionTrigger
  | WorkflowDiscordMentionTrigger;

export type WorkflowTools = {
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
  teamsNotify: boolean;
  discordNotify?: boolean;
};

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
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
};

export type CveVulnerability = {
  dependency: string;
  version?: string;
  advisory?: string;
  severity?: string;
  action?: string;
};

export type WorkflowRunResultPayload =
  | {
      kind: "cve_scan";
      summary: string;
      vulnerabilities: CveVulnerability[];
    }
  | {
      kind: "bug_triage";
      summary: string;
      findings: string[];
      suggestedNextSteps: string[];
    }
  | {
      kind: "pr_review";
      action: "approve" | "comment";
      summary: string;
      inlineCommentCount: number;
    }
  | {
      kind: "generic";
      summary: string;
    };

export type WorkflowRunDetail = WorkflowRunSummary & {
  resultMarkdown: string | null;
  resultPayload: WorkflowRunResultPayload | null;
};

export const DEFAULT_WORKFLOW_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  teamsNotify: false,
  discordNotify: false,
};

export const DEFAULT_WORKFLOW_TIMEZONE = "UTC";

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
    (row.teamsNotify === undefined || typeof row.teamsNotify === "boolean") &&
    (row.discordNotify === undefined || typeof row.discordNotify === "boolean")
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
  return scheduleTriggerLabel(trigger);
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
