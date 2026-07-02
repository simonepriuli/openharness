import { macTitlebarContentOffsetClass } from "./constants";
import { RightPanelToggleButton } from "../RightPanelToggleButton";
import { GitStatusIndicator } from "../GitStatusIndicator";
import { UpdateInstallButton } from "../UpdateInstallButton";
import { OfficeOpenInButton } from "./OfficeOpenInButton";

type WorkspaceHeaderToolbarProps = {
  fillHeader?: boolean;
  isMac: boolean;
  showUpdateButton: boolean;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  cwd: string | null;
  gitStatsRefreshKey?: number;
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
  everydayWorkMode?: boolean;
  officeDocumentActive?: boolean;
  workbookPath?: string;
  documentPath?: string;
};

export function WorkspaceHeaderToolbar({
  fillHeader = false,
  isMac,
  showUpdateButton,
  rightPanelOpen,
  onToggleRightPanel,
  cwd,
  gitStatsRefreshKey = 0,
  githubFullName,
  githubConnected = false,
  onConnectGithub,
  everydayWorkMode = false,
  officeDocumentActive = false,
  workbookPath,
  documentPath,
}: WorkspaceHeaderToolbarProps) {
  const showGitToolbar = !everydayWorkMode && !officeDocumentActive;
  const showOfficeOpenIn = everydayWorkMode || officeDocumentActive;

  return (
    <div
      className={`app-region-no-drag flex items-center gap-2 px-4 ${
        fillHeader ? "w-full min-w-0 justify-end" : "shrink-0"
      } ${isMac ? macTitlebarContentOffsetClass : ""}`}
    >
      {showGitToolbar && cwd && githubConnected && githubFullName ? (
        <a
          className={`flex h-7 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#262626] dark:text-neutral-300 dark:hover:bg-[#2f2f2f] ${
            fillHeader ? "min-w-0 max-w-full shrink truncate" : "shrink-0"
          }`}
          href={`https://github.com/${githubFullName}`}
          target="_blank"
          rel="noreferrer"
          title={`Connected to ${githubFullName}`}
        >
          {githubFullName}
        </a>
      ) : showGitToolbar && cwd && onConnectGithub ? (
        <button
          type="button"
          className="flex h-7 shrink-0 items-center rounded-lg border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-white/[0.12] dark:text-neutral-400 dark:hover:text-neutral-200"
          onClick={onConnectGithub}
        >
          Connect GitHub
        </button>
      ) : null}
      {showUpdateButton ? <UpdateInstallButton className="app-region-no-drag shrink-0" /> : null}
      {!showGitToolbar ? null : (
        <GitStatusIndicator cwd={cwd} refreshKey={gitStatsRefreshKey} className="shrink-0" />
      )}
      {showOfficeOpenIn ? (
        <OfficeOpenInButton cwd={cwd} documentPath={documentPath ?? workbookPath} />
      ) : null}
      {!everydayWorkMode || officeDocumentActive ? (
        <RightPanelToggleButton
          expanded={rightPanelOpen}
          onClick={onToggleRightPanel}
          className="shrink-0"
        />
      ) : null}
    </div>
  );
}
