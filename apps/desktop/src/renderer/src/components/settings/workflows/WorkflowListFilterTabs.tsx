import { SettingsTabs } from "../SettingsTabs";

export type WorkflowListFilter = "mine" | "team";

type WorkflowListFilterTabsProps = {
  value: WorkflowListFilter;
  onChange: (value: WorkflowListFilter) => void;
};

export function WorkflowListFilterTabs({ value, onChange }: WorkflowListFilterTabsProps) {
  return (
    <SettingsTabs
      variant="pill"
      className="workflow-list-filter-tabs"
      value={value}
      onChange={onChange}
      ariaLabel="Filter workflows"
      items={[
        { id: "mine", label: "Mine" },
        { id: "team", label: "Team" },
      ]}
    />
  );
}
