import { macTitlebarContentOffsetClass, titlebarRowClass } from "./constants";
import { MacTitlebarGutter } from "./MacTitlebarGutter";
import { SidebarToggleButton } from "../SidebarToggleButton";
import { WorkspaceHeaderToolbar } from "./WorkspaceHeaderToolbar";

type ChatWorkspaceHeaderProps = {
  title: string;
  isMac: boolean;
  showSidebarToggle: boolean;
  onToggleSidebar: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  cwd: string | null;
  gitStatsRefreshKey?: number;
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
  workMode?: boolean;
  workbookPath?: string;
};

export function ChatWorkspaceHeader({
  title,
  isMac,
  showSidebarToggle,
  onToggleSidebar,
  rightPanelOpen,
  onToggleRightPanel,
  cwd,
  gitStatsRefreshKey,
  githubFullName,
  githubConnected = false,
  onConnectGithub,
  workMode = false,
  workbookPath,
}: ChatWorkspaceHeaderProps) {
  return (
    <div className={titlebarRowClass(isMac)}>
      {showSidebarToggle ? (
        <>
          <MacTitlebarGutter isMac={isMac} />
          <SidebarToggleButton
            expanded={false}
            className={`mr-2 shrink-0 transition-opacity duration-200 opacity-100 ${
              isMac ? macTitlebarContentOffsetClass : ""
            }`}
            onClick={onToggleSidebar}
          />
        </>
      ) : null}

      <h2
        className={`app-region-no-drag m-0 min-w-0 flex-1 truncate px-5 text-base font-medium leading-none text-slate-900 dark:text-neutral-200 ${
          isMac ? macTitlebarContentOffsetClass : ""
        }`}
      >
        {title}
      </h2>

      {!rightPanelOpen ? (
        <WorkspaceHeaderToolbar
          isMac={isMac}
          showUpdateButton={showSidebarToggle}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={onToggleRightPanel}
          cwd={cwd}
          gitStatsRefreshKey={gitStatsRefreshKey}
          githubFullName={githubFullName}
          githubConnected={githubConnected}
          onConnectGithub={onConnectGithub}
          workMode={workMode}
          workbookPath={workbookPath}
        />
      ) : null}
    </div>
  );
}
