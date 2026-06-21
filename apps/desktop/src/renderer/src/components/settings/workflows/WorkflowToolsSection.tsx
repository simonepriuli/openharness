import type { WorkflowTools } from "../../../../../preload/api";
import { SettingsToggle } from "../SettingsToggle";

type WorkflowToolsSectionProps = {
  tools: WorkflowTools;
  onChange: (tools: WorkflowTools) => void;
};

const TOOL_ROWS: Array<{ key: keyof WorkflowTools; label: string }> = [
  { key: "memories", label: "Memories" },
  { key: "prComment", label: "Comment on Pull Request" },
  { key: "prApprove", label: "Approve Pull Request" },
  { key: "prPush", label: "Push commits to PR branch" },
];

export function WorkflowToolsSection({ tools, onChange }: WorkflowToolsSectionProps) {
  const toggle = (key: keyof WorkflowTools) => {
    onChange({ ...tools, [key]: !tools[key] });
  };

  return (
    <section className="workflow-detail-section">
      <h3 className="workflow-detail-label">Tools</h3>
      <div className="workflow-detail-card workflow-tools-card">
        {TOOL_ROWS.map((row) => (
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
