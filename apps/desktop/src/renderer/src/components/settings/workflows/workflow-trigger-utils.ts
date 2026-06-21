import type {
  WorkflowSchedulePreset,
  WorkflowScheduleTrigger,
  WorkflowTrigger,
  WorkflowTriggerEvent,
} from "../../../../../preload/api";
import { DEFAULT_WORKFLOW_TIMEZONE } from "../../../../../preload/api";

export function createGitPrTrigger(event: WorkflowTriggerEvent): WorkflowTrigger {
  return {
    id: crypto.randomUUID(),
    kind: "git_pr",
    event,
    filters: { commentAuthor: "anyone", prAuthor: "anyone" },
  };
}

export function cronExpressionForPreset(
  preset: WorkflowSchedulePreset,
  options: { hour?: number; minute?: number; dayOfWeek?: number } = {},
): string {
  const minute = options?.minute ?? 0;
  const hour = options?.hour ?? 9;
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${options?.dayOfWeek ?? 1}`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function presetLabel(preset: WorkflowSchedulePreset): string {
  switch (preset) {
    case "hourly":
      return "Hourly";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    default:
      return preset;
  }
}

export function createScheduleTrigger(
  preset: WorkflowSchedulePreset | "custom",
): WorkflowScheduleTrigger {
  if (preset === "custom") {
    return {
      id: crypto.randomUUID(),
      kind: "schedule",
      cronExpression: "",
      timezone: DEFAULT_WORKFLOW_TIMEZONE,
      label: "Custom",
    };
  }

  return {
    id: crypto.randomUUID(),
    kind: "schedule",
    preset,
    cronExpression: cronExpressionForPreset(preset),
    timezone: DEFAULT_WORKFLOW_TIMEZONE,
    label: presetLabel(preset),
  };
}

export function parseCronTime(expression: string): { hour: number; minute: number; dayOfWeek?: number } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return { hour: 9, minute: 0 };
  const minute = Number.parseInt(parts[0] ?? "0", 10);
  const hour = Number.parseInt(parts[1] ?? "9", 10);
  const dayOfWeek = parts[4] !== "*" ? Number.parseInt(parts[4] ?? "1", 10) : undefined;
  return {
    minute: Number.isFinite(minute) ? minute : 0,
    hour: Number.isFinite(hour) ? hour : 9,
    dayOfWeek: Number.isFinite(dayOfWeek) ? dayOfWeek : undefined,
  };
}

export function hasGitPrTrigger(triggers: WorkflowTrigger[]): boolean {
  return triggers.some((trigger) => trigger.kind === "git_pr");
}

export function isScheduleOnlyWorkflow(triggers: WorkflowTrigger[]): boolean {
  return triggers.length > 0 && triggers.every((trigger) => trigger.kind === "schedule");
}

const EVENT_LABELS: Record<WorkflowTriggerEvent, string> = {
  pr_opened: "PR opened",
  pr_updated: "PR updated",
  pr_ready: "PR ready for review",
  pr_comment_on_diff: "Comment on PR diff",
  review_submitted: "Review submitted",
};

export function gitPrEventLabel(event: WorkflowTriggerEvent): string {
  return EVENT_LABELS[event];
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function weekdayLabel(day: number): string {
  return WEEKDAY_OPTIONS.find((row) => row.value === day)?.label ?? "Monday";
}

export function formatTimezoneShort(timezone: string, date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });
    const part = formatter.formatToParts(date).find((row) => row.type === "timeZoneName");
    return part?.value?.replace(/^GMT/, "GMT") ?? timezone;
  } catch {
    return timezone;
  }
}

export function scheduleFrequencyPhrase(
  preset: WorkflowSchedulePreset,
  dayOfWeek?: number,
): string {
  switch (preset) {
    case "hourly":
      return "Every hour at";
    case "daily":
      return "Every day at";
    case "weekly":
      return `Every ${weekdayLabel(dayOfWeek ?? 1)} at`;
    default:
      return "Every day at";
  }
}

export { WEEKDAY_OPTIONS };
