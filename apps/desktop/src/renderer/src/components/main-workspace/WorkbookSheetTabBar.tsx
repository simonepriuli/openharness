import { useXlsxViewer } from "@extend-ai/react-xlsx";
import { useEffect } from "react";

type WorkbookSheetTabBarProps = {
  activeSheetName?: string;
  onActiveSheetChange: (sheetName: string) => void;
};

export function WorkbookSheetTabBar({
  activeSheetName,
  onActiveSheetChange,
}: WorkbookSheetTabBarProps) {
  const { tabs, activeTabIndex, setActiveTabIndex, isLoading } = useXlsxViewer();

  useEffect(() => {
    if (isLoading || tabs.length === 0 || !activeSheetName) return;

    const targetIndex = tabs.findIndex((tab) => tab.name === activeSheetName);
    if (targetIndex >= 0 && targetIndex !== activeTabIndex) {
      setActiveTabIndex(targetIndex);
    }
  }, [activeSheetName, activeTabIndex, isLoading, setActiveTabIndex, tabs]);

  if (isLoading || tabs.length <= 1) {
    return null;
  }

  return (
    <div
      className="workbook-sheet-tab-bar app-region-no-drag"
      role="tablist"
      aria-label="Workbook sheets"
    >
      {tabs.map((tab, index) => {
        const isActive = index === activeTabIndex;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`workbook-sheet-tab${isActive ? " workbook-sheet-tab-active" : ""}`}
            title={tab.name}
            onClick={() => {
              if (index === activeTabIndex) return;
              setActiveTabIndex(index);
              onActiveSheetChange(tab.name);
            }}
          >
            <span className="workbook-sheet-tab-label">{tab.name}</span>
          </button>
        );
      })}
    </div>
  );
}
