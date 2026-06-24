import { lazy, Suspense, useLayoutEffect, useRef, type RefObject } from "react";
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
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

const ProjectExplorerPanel = lazy(() =>
  import("./ProjectExplorerPanel").then((module) => ({ default: module.ProjectExplorerPanel })),
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

  const showPlanFooter = activeTab === "plan" && planPhase === "ready";

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        className={`right-panel-resizer${showPlanFooter ? " right-panel-resizer-plan-footer" : ""}`}
        onPointerDown={onResizePointerDown}
      />
      <aside
        ref={panelRef}
        className="right-panel"
        style={{
          width,
          maxWidth: width,
          minWidth: panelMinWidth,
          flex: `0 0 ${width}px`,
        }}
        aria-label="Right panel"
      >
        <div ref={headerRef} className={`right-panel-header ${titlebarRowClass(isMac)}`}>
          <RightPanelTabs
            value={activeTab}
            onChange={onActiveTabChange}
            showPlanTab={showPlanTab}
          />
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
          />
        </div>
        <div className="right-panel-body">
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
        </div>
      </aside>
    </>
  );
}
