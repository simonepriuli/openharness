import { lazy, Suspense, type PointerEvent as ReactPointerEvent } from "react";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import { titlebarRowClass } from "./constants";
import { ExplorerErrorBoundary } from "./ExplorerErrorBoundary";
import { MIN_RIGHT_PANEL_WIDTH } from "../../hooks/useRightPanelResize";
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

const ProjectExplorerPanel = lazy(() =>
  import("./ProjectExplorerPanel").then((module) => ({ default: module.ProjectExplorerPanel })),
);

type RightWorkspacePanelProps = {
  width: number;
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
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelectionAction: OnSelectionAction;
};

export function RightWorkspacePanel({
  width,
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
  onResizePointerDown,
  onSelectionAction,
}: RightWorkspacePanelProps) {
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
          <WorkspaceHeaderToolbar
            fillHeader
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
        </div>
      </aside>
    </>
  );
}
