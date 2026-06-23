import type { PointerEvent as ReactPointerEvent } from "react";
import { titlebarRowClass } from "./constants";
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

type RightWorkspacePanelProps = {
  width: number;
  isMac: boolean;
  showUpdateButton: boolean;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  cwd: string | null;
  filePaths?: string[];
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function RightWorkspacePanel({
  width,
  isMac,
  showUpdateButton,
  rightPanelOpen,
  onToggleRightPanel,
  cwd,
  filePaths,
  githubFullName,
  githubConnected,
  onConnectGithub,
  onResizePointerDown,
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
      <aside className="right-panel" style={{ width }} aria-label="Right panel">
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
        <div className="right-panel-body" />
      </aside>
    </>
  );
}
