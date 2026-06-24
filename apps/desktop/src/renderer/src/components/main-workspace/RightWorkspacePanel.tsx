import { lazy, Suspense, useRef, useState, type RefObject } from "react";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import {
  MIN_RIGHT_PANEL_WIDTH,
  useRightPanelResize,
} from "../../hooks/useRightPanelResize";
import { titlebarRowClass } from "./constants";
import { ExplorerErrorBoundary } from "./ExplorerErrorBoundary";
import { RightPanelTabs, type RightPanelTab } from "./RightPanelTabs";
import { ProjectChangesPanel } from "./ProjectChangesPanel";
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

const ProjectExplorerPanel = lazy(() =>
  import("./ProjectExplorerPanel").then((module) => ({ default: module.ProjectExplorerPanel })),
);

type RightWorkspacePanelProps = {
  width: number;
  onWidthChange: (width: number) => void;
  resizeContainerRef: RefObject<HTMLElement | null>;
  isMac: boolean;
  showUpdateButton: boolean;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  cwd: string | null;
  filePaths?: string[];
  gitStatsRefreshKey: number;
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
  onSelectionAction: OnSelectionAction;
};

export function RightWorkspacePanel({
  width,
  onWidthChange,
  resizeContainerRef,
  isMac,
  showUpdateButton,
  rightPanelOpen,
  onToggleRightPanel,
  cwd,
  filePaths,
  gitStatsRefreshKey,
  githubFullName,
  githubConnected,
  onConnectGithub,
  onSelectionAction,
}: RightWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("files");
  const panelRef = useRef<HTMLElement>(null);
  const { onResizePointerDown } = useRightPanelResize({
    width,
    onWidthChange,
    containerRef: resizeContainerRef,
    panelRef,
  });

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        className="right-panel-resizer"
        onPointerDown={onResizePointerDown}
      />
      <aside
        ref={panelRef}
        className="right-panel"
        style={{
          width,
          maxWidth: width,
          minWidth: MIN_RIGHT_PANEL_WIDTH,
          flex: `0 0 ${width}px`,
        }}
        aria-label="Right panel"
      >
        <div className={`right-panel-header ${titlebarRowClass(isMac)}`}>
          <RightPanelTabs value={activeTab} onChange={setActiveTab} />
          <WorkspaceHeaderToolbar
            isMac={isMac}
            showUpdateButton={showUpdateButton}
            rightPanelOpen={rightPanelOpen}
            onToggleRightPanel={onToggleRightPanel}
            cwd={cwd}
            filePaths={filePaths}
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
        </div>
      </aside>
    </>
  );
}
