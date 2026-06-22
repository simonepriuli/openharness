import { useState } from "react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowScheduleTrigger, WorkflowTrigger } from "../../../../../preload/api";
import { SettingsButton } from "../SettingsButton";
import {
  type TriggerPickerSelection,
  WorkflowTriggerPicker,
} from "./WorkflowTriggerPicker";
import { WorkflowScheduleTriggerRow } from "./WorkflowScheduleTriggerRow";
import { createGitPrTrigger, createScheduleTrigger, createTeamsMentionTrigger } from "./workflow-trigger-utils";

const EVENT_OPTIONS = [
  { value: "pr_opened" as const, label: "PR opened" },
  { value: "pr_updated" as const, label: "PR updated" },
  { value: "pr_ready" as const, label: "PR ready for review" },
  { value: "pr_comment_on_diff" as const, label: "Comment on PR diff" },
  { value: "review_submitted" as const, label: "Review submitted" },
];

type WorkflowTriggersSectionProps = {
  triggers: WorkflowTrigger[];
  repoName: string;
  targetBranch: string;
  onChange: (triggers: WorkflowTrigger[]) => void;
};

function updateScheduleTrigger(
  triggers: WorkflowTrigger[],
  id: string,
  next: WorkflowScheduleTrigger,
): WorkflowTrigger[] {
  return triggers.map((trigger) => (trigger.id === id ? next : trigger));
}

export function WorkflowTriggersSection({
  triggers,
  repoName,
  targetBranch,
  onChange,
}: WorkflowTriggersSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasScheduleTriggers = triggers.some((trigger) => trigger.kind === "schedule");

  const handleSelect = (selection: TriggerPickerSelection) => {
    if (selection.type === "git_pr") {
      onChange([...triggers, createGitPrTrigger(selection.event)]);
      return;
    }
    if (selection.type === "teams_mention") {
      onChange([...triggers, createTeamsMentionTrigger()]);
      return;
    }
    onChange([...triggers, createScheduleTrigger(selection.preset)]);
  };

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <h3 className="workflow-detail-label">Triggers</h3>
        <div className="workflow-trigger-add-wrap">
          <SettingsButton size="sm" className="shrink-0" onClick={() => setPickerOpen(true)}>
            + Add Trigger
          </SettingsButton>
          <WorkflowTriggerPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={handleSelect}
          />
        </div>
      </div>
      <div
        className={`workflow-detail-card${
          hasScheduleTriggers ? " workflow-detail-card-triggers" : ""
        }`}
      >
        {triggers.length === 0 ? (
          <p className="settings-muted text-sm">No triggers yet.</p>
        ) : (
          <ul
            className={`workflow-trigger-list${
              hasScheduleTriggers ? " workflow-trigger-list-schedule" : ""
            }`}
          >
            {triggers.map((trigger) => {
              if (trigger.kind === "schedule") {
                return (
                  <WorkflowScheduleTriggerRow
                    key={trigger.id}
                    trigger={trigger}
                    onChange={(next) => onChange(updateScheduleTrigger(triggers, trigger.id, next))}
                    onRemove={() => onChange(triggers.filter((row) => row.id !== trigger.id))}
                  />
                );
              }

              if (trigger.kind === "teams_mention") {
                return (
                  <li key={trigger.id} className="workflow-trigger-row workflow-git-trigger-row">
                    <span className="workflow-trigger-sentence">
                      When someone <strong>@mentions OpenHarness</strong> in the mapped Teams channel
                      for <strong>{repoName}</strong>
                    </span>
                    <button
                      type="button"
                      className="workflow-trigger-remove"
                      aria-label="Remove trigger"
                      onClick={() => onChange(triggers.filter((row) => row.id !== trigger.id))}
                    >
                      ×
                    </button>
                  </li>
                );
              }

              return (
                <li key={trigger.id} className="workflow-trigger-row workflow-git-trigger-row">
                  <HugeiconsIcon
                    icon={GithubIcon}
                    size={16}
                    strokeWidth={1.75}
                    className="workflow-trigger-icon"
                    aria-hidden
                  />
                  <span className="workflow-trigger-sentence">
                    When{" "}
                    <select
                      className="workflow-trigger-select"
                      value={trigger.event}
                      onChange={(event) => {
                        const nextEvent = event.target.value as typeof trigger.event;
                        onChange(
                          triggers.map((row) =>
                            row.id === trigger.id && row.kind === "git_pr"
                              ? { ...row, event: nextEvent }
                              : row,
                          ),
                        );
                      }}
                    >
                      {EVENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>{" "}
                    on <strong>{repoName}</strong>
                    {targetBranch ? (
                      <>
                        {" "}
                        against <strong>{targetBranch}</strong>
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="workflow-trigger-remove"
                    aria-label="Remove trigger"
                    onClick={() => onChange(triggers.filter((row) => row.id !== trigger.id))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export { createGitPrTrigger as createTrigger } from "./workflow-trigger-utils";
