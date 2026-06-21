import type { WorkflowTrigger, WorkflowTriggerEvent } from "../../../../../preload/api";
import { createTrigger } from "./WorkflowEditorView";

const EVENT_OPTIONS: Array<{ value: WorkflowTriggerEvent; label: string }> = [
  { value: "pr_opened", label: "PR opened" },
  { value: "pr_updated", label: "PR updated" },
  { value: "pr_ready", label: "PR ready for review" },
  { value: "pr_comment_on_diff", label: "Comment on PR diff" },
  { value: "review_submitted", label: "Review submitted" },
];

type WorkflowTriggersSectionProps = {
  triggers: WorkflowTrigger[];
  repoName: string;
  onChange: (triggers: WorkflowTrigger[]) => void;
};

export function WorkflowTriggersSection({
  triggers,
  repoName,
  onChange,
}: WorkflowTriggersSectionProps) {
  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <h3 className="workflow-detail-label">Triggers</h3>
        <button
          type="button"
          className="settings-button settings-button-secondary settings-button-sm shrink-0"
          onClick={() => onChange([...triggers, createTrigger("pr_opened")])}
        >
          + Add Trigger
        </button>
      </div>
      <div className="workflow-detail-card">
        {triggers.length === 0 ? (
          <p className="settings-muted text-sm">No triggers yet.</p>
        ) : (
          <ul className="workflow-trigger-list">
            {triggers.map((trigger) => (
              <li key={trigger.id} className="workflow-trigger-row">
                <span className="workflow-trigger-sentence">
                  When{" "}
                  <select
                    className="workflow-trigger-select"
                    value={trigger.event}
                    onChange={(event) => {
                      const nextEvent = event.target.value as WorkflowTriggerEvent;
                      onChange(
                        triggers.map((row) =>
                          row.id === trigger.id ? { ...row, event: nextEvent } : row,
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
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
