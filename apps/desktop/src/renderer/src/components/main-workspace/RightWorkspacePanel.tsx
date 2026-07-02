import { lazy, Suspense, useLayoutEffect, useRef, type RefObject } from "react";
import type { WorkbookTabsState } from "@renderer/lib/conversation-runtime";
import { officeFileKindFromPath } from "@renderer/lib/conversation-runtime";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import { useRightPanelHeaderMinWidth } from "../../hooks/useRightPanelHeaderMinWidth";
import {
  useRightPanelResize,
} from "../../hooks/useRightPanelResize";
import { titlebarRowClass } from "./constants";
import { ExplorerErrorBoundary } from "./ExplorerErrorBoundary";
import { RightPanelTabs, type RightPanelTab } from "./RightPanelTabs";
import { ProjectChangesPanel } from "./ProjectChangesPanel";
import { ProjectPlanPanel } from "./ProjectPlanPanel";
import { OfficeDocumentTabBar } from "./OfficeDocumentTabBar";
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

const ProjectExplorerPanel = lazy(() =>
  import("./ProjectExplorerPanel").then((module) => ({ default: module.ProjectExplorerPanel })),
);

const WorkModeXlsxPanel = lazy(() =>
  import("./WorkModeXlsxPanel").then((module) => ({ default: module.WorkModeXlsxPanel })),
);

const WorkModeDocxPanel = lazy(() =>
  import("./WorkModeDocxPanel").then((module) => ({ default: module.WorkModeDocxPanel })),
);

const WorkModeMarkdownPanel = lazy(() =>
  import("./WorkModeMarkdownPanel").then((module) => ({ default: module.WorkModeMarkdownPanel })),
);

type RightWorkspacePanelProps = {
  width: number;
  onWidthChange: (width: number) => void;
  onMinWidthChange?: (minWidth: number) => void;
  resizeContainerRef: RefObject<HTMLElement | null>;
  isMac: boolean;
  showUpdateButton: boolean;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  activeTab: RightPanelTab;
  onActiveTabChange: (tab: RightPanelTab) => void;
  cwd: string | null;
  conversationId: string | null;
  sessionKey?: string | null;
  planPhase: "interview" | "ready" | "implementing" | null;
  showPlanTab: boolean;
  planRefreshKey: number;
  implementingPlan?: boolean;
  onImplementPlan: () => void;
  gitStatsRefreshKey: number;
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
  onSelectionAction: OnSelectionAction;
  everydayWorkMode?: boolean;
  officeViewActive?: boolean;
  workbookTabs?: WorkbookTabsState;
  activeWorkbookPath?: string;
  activeWorkbookSheet?: string;
  workbookRefreshKey?: number;
  onWorkbookTabSelect?: (relativePath: string) => void;
  onWorkbookTabClose?: (relativePath: string) => void;
  onWorkbookManualRefresh?: () => void;
  onWorkbookSheetChange?: (sheetName: string) => void;
};

export function RightWorkspacePanel({
  width,
  onWidthChange,
  onMinWidthChange,
  resizeContainerRef,
  isMac,
  showUpdateButton,
  rightPanelOpen,
  onToggleRightPanel,
  activeTab,
  onActiveTabChange,
  cwd,
  conversationId,
  sessionKey = null,
  planPhase,
  showPlanTab,
  planRefreshKey,
  implementingPlan = false,
  onImplementPlan,
  gitStatsRefreshKey,
  githubFullName,
  githubConnected,
  onConnectGithub,
  onSelectionAction,
  everydayWorkMode = false,
  officeViewActive = false,
  workbookTabs,
  activeWorkbookPath,
  activeWorkbookSheet,
  workbookRefreshKey = 0,
  onWorkbookTabSelect,
  onWorkbookTabClose,
  onWorkbookManualRefresh,
  onWorkbookSheetChange,
}: RightWorkspacePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelMinWidth = useRightPanelHeaderMinWidth(headerRef);
  const { onResizePointerDown, clampWidth } = useRightPanelResize({
    width,
    onWidthChange,
    containerRef: resizeContainerRef,
    panelRef,
    minWidth: panelMinWidth,
  });

  useLayoutEffect(() => {
    onMinWidthChange?.(panelMinWidth);
  }, [onMinWidthChange, panelMinWidth]);

  useLayoutEffect(() => {
    if (width < panelMinWidth) {
      onWidthChange(clampWidth(panelMinWidth));
    }
  }, [clampWidth, onWidthChange, panelMinWidth, width]);

  const hasOfficeTabs = (workbookTabs?.openPaths.length ?? 0) > 0;
  const showCodingTabs = !everydayWorkMode;
  const showOfficeTabBar = everydayWorkMode || hasOfficeTabs;
  const showOfficeBody =
    hasOfficeTabs && (everydayWorkMode || officeViewActive);
  const useWorkModeChrome = everydayWorkMode || (hasOfficeTabs && officeViewActive);

  const showPlanFooter = activeTab === "plan" && planPhase === "ready" && !showOfficeBody;
  const activeOfficeKind = activeWorkbookPath
    ? officeFileKindFromPath(activeWorkbookPath)
    : undefined;

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        className={`right-panel-resizer${showPlanFooter ? " right-panel-resizer-plan-footer" : ""}${useWorkModeChrome ? " right-panel-resizer--work-mode" : ""}`}
        onPointerDown={onResizePointerDown}
      />
      <aside
        ref={panelRef}
        className={`right-panel${useWorkModeChrome ? " right-panel--work-mode" : ""}`}
        style={{
          width,
          maxWidth: width,
          minWidth: panelMinWidth,
          flex: `0 0 ${width}px`,
        }}
        aria-label="Right panel"
      >
        <div ref={headerRef} className={`right-panel-header ${titlebarRowClass(isMac)}`}>
          <div
            className={`right-panel-header-tabs min-w-0 flex-1${showCodingTabs && showOfficeTabBar ? " right-panel-header-tabs--stacked" : ""}`}
          >
            {showCodingTabs ? (
              <RightPanelTabs
                value={activeTab}
                onChange={onActiveTabChange}
                showPlanTab={showPlanTab}
              />
            ) : null}
            {showOfficeTabBar ? (
              <OfficeDocumentTabBar
                workbookTabs={workbookTabs}
                onSelectTab={onWorkbookTabSelect ?? (() => {})}
                onCloseTab={onWorkbookTabClose ?? (() => {})}
              />
            ) : null}
          </div>
          <WorkspaceHeaderToolbar
            isMac={isMac}
            showUpdateButton={showUpdateButton}
            rightPanelOpen={rightPanelOpen}
            onToggleRightPanel={onToggleRightPanel}
            cwd={cwd}
            gitStatsRefreshKey={gitStatsRefreshKey}
            githubFullName={githubFullName}
            githubConnected={githubConnected}
            onConnectGithub={onConnectGithub}
            everydayWorkMode={everydayWorkMode}
            officeDocumentActive={showOfficeBody}
            workbookPath={activeWorkbookPath}
            documentPath={activeWorkbookPath}
          />
        </div>
        <div className="right-panel-body">
          {showOfficeBody ? (
            <ExplorerErrorBoundary>
              <Suspense
                fallback={
                  <div className="project-explorer-placeholder">
                    Loading{" "}
                    {activeOfficeKind === "docx"
                      ? "document"
                      : activeOfficeKind === "md"
                        ? "markdown"
                        : "workbook"}{" "}
                    viewer…
                  </div>
                }
              >
                {activeOfficeKind === "docx" ? (
                  <WorkModeDocxPanel
                    cwd={cwd}
                    sessionKey={sessionKey}
                    activePath={activeWorkbookPath}
                    refreshKey={workbookRefreshKey}
                    onManualRefresh={onWorkbookManualRefresh ?? (() => {})}
                  />
                ) : activeOfficeKind === "md" ? (
                  <WorkModeMarkdownPanel
                    cwd={cwd}
                    sessionKey={sessionKey}
                    activePath={activeWorkbookPath}
                    refreshKey={workbookRefreshKey}
                    onManualRefresh={onWorkbookManualRefresh ?? (() => {})}
                  />
                ) : (
                  <WorkModeXlsxPanel
                    cwd={cwd}
                    sessionKey={sessionKey}
                    activePath={activeWorkbookPath}
                    activeSheetName={activeWorkbookSheet}
                    refreshKey={workbookRefreshKey}
                    onManualRefresh={onWorkbookManualRefresh ?? (() => {})}
                    onActiveSheetChange={onWorkbookSheetChange ?? (() => {})}
                  />
                )}
              </Suspense>
            </ExplorerErrorBoundary>
          ) : (
            <>
              {activeTab === "files" ? (
                <ExplorerErrorBoundary>
                  <Suspense
                    fallback={<div className="project-explorer-placeholder">Loading explorer…</div>}
                  >
                    <ProjectExplorerPanel
                      cwd={cwd}
                      gitStatsRefreshKey={gitStatsRefreshKey}
                      onSelectionAction={onSelectionAction}
                    />
                  </Suspense>
                </ExplorerErrorBoundary>
              ) : null}
              {activeTab === "changes" ? (
                <ExplorerErrorBoundary>
                  <ProjectChangesPanel
                    cwd={cwd}
                    gitStatsRefreshKey={gitStatsRefreshKey}
                    enabled={activeTab === "changes"}
                  />
                </ExplorerErrorBoundary>
              ) : null}
              {activeTab === "plan" ? (
                <ExplorerErrorBoundary>
                  <ProjectPlanPanel
                    cwd={cwd}
                    conversationId={conversationId}
                    planPhase={planPhase}
                    refreshKey={planRefreshKey}
                    enabled={activeTab === "plan"}
                    implementing={implementingPlan}
                    onImplementPlan={onImplementPlan}
                  />
                </ExplorerErrorBoundary>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
