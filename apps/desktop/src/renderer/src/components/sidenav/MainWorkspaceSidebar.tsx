import { Add01Icon, Folder01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, type RefObject } from "react";
import type { ConversationSummary, ProjectSummary } from "../../../../preload/api";
import type { SettingsSection } from "../settings/SettingsNav";
import {
  electronMacVibrancy,
  macTitlebarContentOffsetClass,
  sidenavBorder,
  sidenavRowHover,
  sidenavSurface,
  titlebarRowClass,
} from "../main-workspace/constants";
import { MacTitlebarGutter } from "../main-workspace/MacTitlebarGutter";
import { SidebarToggleButton } from "../SidebarToggleButton";
import { UpdateInstallButton } from "../UpdateInstallButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ProjectConversationList } from "./ProjectConversationList";
import { ProjectRowMenu } from "./ProjectRowMenu";
import { SidenavFooter } from "./SidenavFooter";

type MainWorkspaceSidebarProps = {
  sidebarRef: RefObject<HTMLElement | null>;
  sidebarOpen: boolean;
  isMac: boolean;
  onToggleSidebar: () => void;
  projects: ProjectSummary[];
  projectsLoading: boolean;
  expandedProjectCwds: ReadonlySet<string>;
  onToggleProjectExpanded: (cwd: string) => void;
  selectedProjectCwd: string | null;
  selectedSessionFile: string | null;
  selectedConversationId: string | null;
  conversationRefreshKey: number;
  streamingConversationIds: ReadonlySet<string>;
  onSelectConversation: (projectCwd: string, conversation: ConversationSummary) => void;
  onArchiveConversation: (projectCwd: string, conversation: ConversationSummary) => void;
  onArchiveAllChats: (projectCwd: string) => void;
  onRemoveProject: (projectCwd: string) => void;
  onOpenFolder: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  tokensRefreshKey: number;
  onNewConversationForProject: (cwd: string) => void;
  githubConnectedByPath: Record<string, boolean>;
  onConnectGithub: (projectCwd: string) => void;
  onDisconnectGithub: (projectCwd: string) => void;
};

function MainWorkspaceSidebarInner({
  sidebarRef,
  sidebarOpen,
  isMac,
  onToggleSidebar,
  projects,
  projectsLoading,
  expandedProjectCwds,
  onToggleProjectExpanded,
  selectedProjectCwd,
  selectedSessionFile,
  selectedConversationId,
  conversationRefreshKey,
  streamingConversationIds,
  onSelectConversation,
  onArchiveConversation,
  onArchiveAllChats,
  onRemoveProject,
  onOpenFolder,
  onOpenSettings,
  tokensRefreshKey,
  onNewConversationForProject,
  githubConnectedByPath,
  onConnectGithub,
  onDisconnectGithub,
}: MainWorkspaceSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
      aria-hidden={!sidebarOpen}
      className={`flex shrink-0 overflow-hidden border-r transition-[width,border-color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] ${
        sidebarOpen ? `w-[280px] border-r ${sidenavBorder}` : "w-0 border-transparent"
      } ${electronMacVibrancy ? "sidebar-translucent" : sidenavSurface}`}
    >
      <div
        className={`flex w-[280px] shrink-0 flex-col transition-[opacity,transform] duration-200 ease-out ${
          sidebarOpen
            ? "translate-x-0 opacity-100 delay-100"
            : "pointer-events-none -translate-x-4 opacity-0"
        }`}
      >
        <div className={titlebarRowClass(isMac)}>
          <MacTitlebarGutter isMac={isMac} variant="sidebar" />
          <div
            className={`flex min-w-0 flex-1 items-center gap-1 pr-3 ${isMac ? "pl-0" : "px-3"} ${
              isMac ? macTitlebarContentOffsetClass : ""
            }`}
          >
            <SidebarToggleButton expanded onClick={onToggleSidebar} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Open project folder"
                  className={`app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-800 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover}`}
                  onClick={onOpenFolder}
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.7} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open folder to add a project</TooltipContent>
            </Tooltip>
            <UpdateInstallButton className="app-region-no-drag ml-auto" />
          </div>
        </div>

        <div className="app-region-no-drag sidenav-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          {projectsLoading ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Loading projects…</p>
          ) : projects.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Open a folder to add a project and start chatting with Pi.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {projects.map((project) => {
                const expanded = expandedProjectCwds.has(project.cwd);
                const isSelectedProject = selectedProjectCwd === project.cwd;
                return (
                  <li key={project.cwd}>
                    <div
                      className={`group app-region-no-drag flex h-10 w-full items-center rounded-md transition-colors ${sidenavRowHover}`}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-800 dark:text-neutral-100"
                        onClick={() => onToggleProjectExpanded(project.cwd)}
                      >
                        <HugeiconsIcon
                          icon={expanded ? FolderOpenIcon : Folder01Icon}
                          size={14}
                          strokeWidth={1.5}
                          className="shrink-0 text-slate-500 dark:text-neutral-400"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      </button>
                      <ProjectRowMenu
                        projectName={project.name}
                        projectCwd={project.cwd}
                        githubConnected={githubConnectedByPath[project.cwd] === true}
                        onArchiveAllChats={() => onArchiveAllChats(project.cwd)}
                        onRemoveProject={() => onRemoveProject(project.cwd)}
                        onConnectGithub={() => onConnectGithub(project.cwd)}
                        onDisconnectGithub={() => onDisconnectGithub(project.cwd)}
                      />
                      <button
                        type="button"
                        aria-label={`New conversation in ${project.name}`}
                        className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-slate-700 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNewConversationForProject(project.cwd);
                        }}
                      >
                        <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.6} aria-hidden />
                      </button>
                    </div>
                    <ProjectConversationList
                      cwd={project.cwd}
                      expanded={expanded}
                      selectedSessionFile={isSelectedProject ? selectedSessionFile : null}
                      selectedConversationId={isSelectedProject ? selectedConversationId : null}
                      refreshKey={conversationRefreshKey}
                      streamingConversationIds={streamingConversationIds}
                      onSelectConversation={onSelectConversation}
                      onArchiveConversation={onArchiveConversation}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SidenavFooter
          tokensRefreshKey={tokensRefreshKey}
          onOpenFolder={onOpenFolder}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </aside>
  );
}

export const MainWorkspaceSidebar = memo(MainWorkspaceSidebarInner);
