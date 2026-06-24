import { File01Icon, FileDiffIcon } from "@hugeicons/core-free-icons";
import { SettingsTabs } from "../settings/SettingsTabs";

export type RightPanelTab = "files" | "changes";

type RightPanelTabsProps = {
  value: RightPanelTab;
  onChange: (tab: RightPanelTab) => void;
};

export function RightPanelTabs({ value, onChange }: RightPanelTabsProps) {
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
      ]}
    />
  );
}
