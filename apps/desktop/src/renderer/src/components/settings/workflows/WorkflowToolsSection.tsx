import type { WorkflowTools, WorkflowTrigger } from "../../../../../preload/api";
import { SettingsToggle } from "../SettingsToggle";
import { hasGitPrTrigger } from "./workflow-trigger-utils";

type WorkflowGithubActionsSectionProps = {
  tools: WorkflowTools;
  triggers: WorkflowTrigger[];
  onChange: (tools: WorkflowTools) => void;
};

const ACTION_ROWS: Array<{ key: keyof WorkflowTools; label: string }> = [
  { key: "prComment", label: "Comment on Pull Request" },
  { key: "prApprove", label: "Approve Pull Request" },
  { key: "prPush", label: "Push commits to PR branch" },
];

export function WorkflowGithubActionsSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  if (!hasGitPrTrigger(triggers)) return null;

  const toggle = (key: keyof WorkflowTools) => {
    onChange({ ...tools, [key]: !tools[key] });
  };

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">GitHub actions</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Actions OpenHarness may take on GitHub after the agent finishes.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        {ACTION_ROWS.map((row) => (
          <div key={row.key} className="workflow-tool-row">
            <span>{row.label}</span>
            <SettingsToggle
              label={row.label}
              checked={tools[row.key]}
              onChange={() => toggle(row.key)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
