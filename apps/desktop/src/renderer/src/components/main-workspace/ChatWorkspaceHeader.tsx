import { macTitlebarContentOffsetClass, titlebarRowClass } from "./constants";
import { MacTitlebarGutter } from "./MacTitlebarGutter";
import { SidebarToggleButton } from "../SidebarToggleButton";
import { GitStatusIndicator } from "../GitStatusIndicator";
import { UpdateInstallButton } from "../UpdateInstallButton";

type ChatWorkspaceHeaderProps = {
  title: string;
  isMac: boolean;
  showSidebarToggle: boolean;
  onToggleSidebar: () => void;
  cwd: string | null;
  filePaths?: string[];
  githubFullName?: string | null;
  githubConnected?: boolean;
  onConnectGithub?: () => void;
};

export function ChatWorkspaceHeader({
  title,
  isMac,
  showSidebarToggle,
  onToggleSidebar,
  cwd,
  filePaths,
  githubFullName,
  githubConnected = false,
  onConnectGithub,
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

      <div
        className={`app-region-no-drag flex shrink-0 items-center gap-2 pr-4 ${
          isMac ? macTitlebarContentOffsetClass : ""
        }`}
      >
        {cwd && githubConnected && githubFullName ? (
          <a
            className="flex h-7 max-w-[12rem] items-center truncate rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#262626] dark:text-neutral-300 dark:hover:bg-[#2f2f2f]"
            href={`https://github.com/${githubFullName}`}
            target="_blank"
            rel="noreferrer"
            title={`Connected to ${githubFullName}`}
          >
            {githubFullName}
          </a>
        ) : cwd && onConnectGithub ? (
          <button
            type="button"
            className="flex h-7 items-center rounded-lg border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-white/[0.12] dark:text-neutral-400 dark:hover:text-neutral-200"
            onClick={onConnectGithub}
          >
            Connect GitHub
          </button>
        ) : null}
        {showSidebarToggle ? <UpdateInstallButton className="app-region-no-drag" /> : null}
        <GitStatusIndicator cwd={cwd} filePaths={filePaths} />
      </div>
    </div>
  );
}
