import { Cancel01Icon, FileSpreadsheetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkbookTabsState } from "@renderer/lib/conversation-runtime";

type WorkbookTabBarProps = {
  workbookTabs?: WorkbookTabsState;
  onSelectTab: (relativePath: string) => void;
  onCloseTab: (relativePath: string) => void;
};

function workbookFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

export function WorkbookTabBar({ workbookTabs, onSelectTab, onCloseTab }: WorkbookTabBarProps) {
  const openPaths = workbookTabs?.openPaths ?? [];
  const activePath = workbookTabs?.activePath ?? openPaths[openPaths.length - 1];

  if (openPaths.length === 0) {
    return (
      <div className="workbook-tab-bar-fallback right-panel-work-mode-label">
        <HugeiconsIcon
          icon={FileSpreadsheetIcon}
          size={14}
          strokeWidth={1.75}
          className="right-panel-work-mode-label-icon"
          aria-hidden
        />
        Spreadsheets
      </div>
    );
  }

  return (
    <div
      className="settings-tabs settings-tabs-pill workbook-tab-bar right-panel-tabs app-region-no-drag"
      role="tablist"
      aria-label="Open spreadsheets"
    >
      {openPaths.map((path) => {
        const isActive = path === activePath;
        return (
          <div
            key={path}
            className={`settings-tabs-tab workbook-tab${isActive ? " settings-tabs-tab-active" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className="workbook-tab-label"
              title={path}
              onClick={() => onSelectTab(path)}
            >
              <HugeiconsIcon
                icon={FileSpreadsheetIcon}
                size={14}
                strokeWidth={1.75}
                className="settings-tabs-tab-icon"
                aria-hidden
              />
              <span className="workbook-tab-label-text">{workbookFileName(path)}</span>
            </button>
            <button
              type="button"
              className="workbook-tab-close"
              aria-label={`Close ${workbookFileName(path)}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(path);
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
