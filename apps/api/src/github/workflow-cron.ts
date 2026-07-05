import { CronExpressionParser } from "cron-parser";
import { Result } from "better-result";
import type { WorkflowScheduleTrigger } from "./workflow-types.js";

export function isValidTimezone(timezone: string): boolean {
  return Result.isOk(
    Result.try({
      try: () => {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
      },
      catch: () => false,
    }),
  );
}

export function validateCronExpression(
  expression: string,
  timezone: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, error: "Cron expression is required" };
  if (!isValidTimezone(timezone)) return { ok: false, error: "Invalid timezone" };

  const parsed = Result.try({
    try: () => {
      CronExpressionParser.parse(trimmed, { tz: timezone });
      return true;
    },
    catch: () => false,
  });
  if (!Result.isOk(parsed)) {
    return { ok: false, error: "Invalid cron expression" };
  }
  return { ok: true };
}

export function validateScheduleTrigger(
  trigger: WorkflowScheduleTrigger,
): { ok: true } | { ok: false; error: string } {
  return validateCronExpression(trigger.cronExpression, trigger.timezone);
}

export function isCronDue(
  expression: string,
  timezone: string,
  now: Date,
  windowMs = 60_000,
): boolean {
  const due = Result.try({
    try: () => {
      const interval = CronExpressionParser.parse(expression, { tz: timezone, currentDate: now });
      const prev = interval.prev().toDate();
      return now.getTime() - prev.getTime() < windowMs;
    },
    catch: () => false,
  });
  return Result.isOk(due) && due.value;
}

export function scheduleDeliveryId(
  workflowId: string,
  triggerId: string,
  minuteKey: string,
): string {
  return `schedule:${workflowId}:${triggerId}:${minuteKey}`;
}

export function manualDeliveryId(workflowId: string, runId: string): string {
  return `manual:${workflowId}:${runId}`;
}

export function minuteKeyForDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
