import { Cancel01Icon, File01Icon, FileSpreadsheetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkbookTabsState } from "@renderer/lib/conversation-runtime";
import { officeFileKindFromPath } from "@renderer/lib/conversation-runtime";

type OfficeDocumentTabBarProps = {
  workbookTabs?: WorkbookTabsState;
  onSelectTab: (relativePath: string) => void;
  onCloseTab: (relativePath: string) => void;
};

function officeFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

function TabIcon({ path }: { path: string }) {
  const kind = officeFileKindFromPath(path);
  if (kind === "docx") {
    return (
      <HugeiconsIcon
        icon={File01Icon}
        size={14}
        strokeWidth={1.75}
        className="settings-tabs-tab-icon"
        aria-hidden
      />
    );
  }
  if (kind === "md") {
    return (
      <HugeiconsIcon
        icon={File01Icon}
        size={14}
        strokeWidth={1.75}
        className="settings-tabs-tab-icon work-mode-markdown-tab-icon"
        aria-hidden
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={FileSpreadsheetIcon}
      size={14}
      strokeWidth={1.75}
      className="settings-tabs-tab-icon"
      aria-hidden
    />
  );
}

export function OfficeDocumentTabBar({
  workbookTabs,
  onSelectTab,
  onCloseTab,
}: OfficeDocumentTabBarProps) {
  const openPaths = workbookTabs?.openPaths ?? [];
  const activePath = workbookTabs?.activePath ?? openPaths[openPaths.length - 1];

  if (openPaths.length === 0) {
    return (
      <div className="workbook-tab-bar-fallback right-panel-work-mode-label">
        <HugeiconsIcon
          icon={File01Icon}
          size={14}
          strokeWidth={1.75}
          className="right-panel-work-mode-label-icon"
          aria-hidden
        />
        Documents
      </div>
    );
  }

  return (
    <div
      className="settings-tabs settings-tabs-pill workbook-tab-bar right-panel-tabs app-region-no-drag"
      role="tablist"
      aria-label="Open documents"
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
              <TabIcon path={path} />
              <span className="workbook-tab-label-text">{officeFileName(path)}</span>
            </button>
            <button
              type="button"
              className="workbook-tab-close"
              aria-label={`Close ${officeFileName(path)}`}
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

/** @deprecated Use OfficeDocumentTabBar */
export const WorkbookTabBar = OfficeDocumentTabBar;
