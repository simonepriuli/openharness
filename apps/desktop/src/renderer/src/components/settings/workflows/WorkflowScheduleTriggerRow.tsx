import { ArrowDown01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, type ReactNode } from "react";
import type { WorkflowScheduleTrigger } from "../../../../../preload/api";
import {
  cronExpressionForPreset,
  formatTimezoneShort,
  parseCronTime,
  scheduleFrequencyPhrase,
  WEEKDAY_OPTIONS,
} from "./workflow-trigger-utils";

import { WorkflowScheduleMinutePicker } from "./WorkflowScheduleMinutePicker";

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

type WorkflowScheduleTriggerRowProps = {
  trigger: WorkflowScheduleTrigger;
  onChange: (next: WorkflowScheduleTrigger) => void;
  onRemove: () => void;
};

function SchedulePill({
  children,
  className,
  showChevron = true,
  onActivate,
}: {
  children: ReactNode;
  className?: string;
  showChevron?: boolean;
  onActivate?: () => void;
}) {
  return (
    <span
      className={`workflow-schedule-pill${className ? ` ${className}` : ""}${
        onActivate ? " workflow-schedule-pill-interactive" : ""
      }`}
      onClick={
        onActivate
          ? (event) => {
              const target = event.target as HTMLElement;
              if (target.closest("input, select")) return;
              onActivate();
            }
          : undefined
      }
    >
      {children}
      {showChevron ? (
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          strokeWidth={2}
          className="workflow-schedule-pill-chevron"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export function WorkflowScheduleTriggerRow({
  trigger,
  onChange,
  onRemove,
}: WorkflowScheduleTriggerRowProps) {
  const dailyTimeInputRef = useRef<HTMLInputElement>(null);
  const weeklyTimeInputRef = useRef<HTMLInputElement>(null);
  const { hour, minute, dayOfWeek } = parseCronTime(trigger.cronExpression);
  const isCustom = !trigger.preset;
  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const openTimePicker = (inputRef: { current: HTMLInputElement | null }) => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        input.click();
      }
    }
  };

  const updateCronFromPreset = (
    preset: WorkflowScheduleTrigger["preset"],
    time: { hour: number; minute: number; dayOfWeek?: number },
  ) => {
    if (!preset) return;
    onChange({
      ...trigger,
      cronExpression: cronExpressionForPreset(preset, time),
    });
  };

  return (
    <li className="workflow-schedule-trigger-row">
      <HugeiconsIcon
        icon={Clock01Icon}
        size={16}
        strokeWidth={1.75}
        className="workflow-schedule-trigger-icon"
        aria-hidden
      />

      <div className="workflow-schedule-trigger-body">
        {isCustom ? (
          <>
            <span>Cron</span>
            <SchedulePill className="workflow-schedule-pill-wide" showChevron={false}>
              <input
                type="text"
                className="workflow-schedule-pill-input workflow-schedule-pill-input-cron"
                value={trigger.cronExpression}
                placeholder="0 9 * * *"
                spellCheck={false}
                onChange={(event) =>
                  onChange({ ...trigger, cronExpression: event.target.value, label: "Custom" })
                }
              />
            </SchedulePill>
          </>
        ) : trigger.preset === "hourly" ? (
          <>
            <span>{scheduleFrequencyPhrase("hourly")}</span>
            <WorkflowScheduleMinutePicker
              value={minute}
              onChange={(nextMinute) => {
                updateCronFromPreset("hourly", { hour, minute: nextMinute });
              }}
            />
          </>
        ) : trigger.preset === "weekly" ? (
          <>
            <span>Every</span>
            <SchedulePill className="workflow-schedule-pill-day">
              <select
                className="workflow-schedule-pill-select"
                value={dayOfWeek ?? 1}
                aria-label="Day of week"
                onChange={(event) => {
                  const nextDay = Number.parseInt(event.target.value, 10);
                  updateCronFromPreset("weekly", {
                    hour,
                    minute,
                    dayOfWeek: Number.isFinite(nextDay) ? nextDay : 1,
                  });
                }}
              >
                {WEEKDAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SchedulePill>
            <span>at</span>
            <SchedulePill
              className="workflow-schedule-pill-time"
              onActivate={() => openTimePicker(weeklyTimeInputRef)}
            >
              <input
                ref={weeklyTimeInputRef}
                type="time"
                className="workflow-schedule-pill-input workflow-schedule-pill-input-time"
                value={timeValue}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(":").map((v) => Number.parseInt(v, 10));
                  updateCronFromPreset("weekly", {
                    hour: Number.isFinite(h) ? h : hour,
                    minute: Number.isFinite(m) ? m : minute,
                    dayOfWeek,
                  });
                }}
              />
            </SchedulePill>
          </>
        ) : (
          <>
            <span>{scheduleFrequencyPhrase("daily")}</span>
            <SchedulePill
              className="workflow-schedule-pill-time"
              onActivate={() => openTimePicker(dailyTimeInputRef)}
            >
              <input
                ref={dailyTimeInputRef}
                type="time"
                className="workflow-schedule-pill-input workflow-schedule-pill-input-time"
                value={timeValue}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(":").map((v) => Number.parseInt(v, 10));
                  updateCronFromPreset("daily", {
                    hour: Number.isFinite(h) ? h : hour,
                    minute: Number.isFinite(m) ? m : minute,
                  });
                }}
              />
            </SchedulePill>
          </>
        )}

        <select
          className="workflow-schedule-tz"
          value={trigger.timezone}
          aria-label="Timezone"
          onChange={(event) => onChange({ ...trigger, timezone: event.target.value })}
        >
          {!TIMEZONE_OPTIONS.includes(trigger.timezone) ? (
            <option value={trigger.timezone}>{formatTimezoneShort(trigger.timezone)}</option>
          ) : null}
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {formatTimezoneShort(tz)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="workflow-trigger-remove"
        aria-label="Remove trigger"
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}
