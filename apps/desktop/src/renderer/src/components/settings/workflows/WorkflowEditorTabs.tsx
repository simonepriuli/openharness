import { SettingsTabs } from "../SettingsTabs";

export type WorkflowEditorTab = "settings" | "history";

type WorkflowEditorTabsProps = {
  value: WorkflowEditorTab;
  onChange: (tab: WorkflowEditorTab) => void;
};

export function WorkflowEditorTabs({ value, onChange }: WorkflowEditorTabsProps) {
  return (
    <SettingsTabs
      variant="pill"
      className="workflow-editor-tabs"
      value={value}
      onChange={onChange}
      ariaLabel="Workflow sections"
      items={[
        { id: "settings", label: "Settings" },
        { id: "history", label: "Run History" },
      ]}
    />
  );
}
