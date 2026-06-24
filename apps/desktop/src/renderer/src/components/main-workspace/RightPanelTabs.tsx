import { File01Icon, FileDiffIcon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { SettingsTabs } from "../settings/SettingsTabs";

export type RightPanelTab = "files" | "changes" | "plan";

type RightPanelTabsProps = {
  value: RightPanelTab;
  onChange: (tab: RightPanelTab) => void;
  showPlanTab?: boolean;
};

export function RightPanelTabs({ value, onChange, showPlanTab = false }: RightPanelTabsProps) {
  return (
    <SettingsTabs
      variant="pill"
      className="right-panel-tabs app-region-no-drag"
      value={value}
      onChange={onChange}
      ariaLabel="Right panel sections"
      items={[
        { id: "files", label: "Files", icon: File01Icon },
        { id: "changes", label: "Changes", icon: FileDiffIcon },
        { id: "plan", label: "Plan", icon: LeftToRightListBulletIcon, hidden: !showPlanTab },
      ]}
    />
  );
}
