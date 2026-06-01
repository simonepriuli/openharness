import { Add01Icon, Folder01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, type RefObject } from "react";
import type { ConversationSummary, ProjectSummary } from "../../../../preload/api";
import {
  electronMacVibrancy,
  macTitlebarContentOffsetClass,
  titlebarRowClass,
} from "../main-workspace/constants";
import { MacTitlebarGutter } from "../main-workspace/MacTitlebarGutter";
import { SidebarToggleButton } from "../SidebarToggleButton";
import { ProjectConversationList } from "./ProjectConversationList";
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
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onNewConversationForProject: (cwd: string) => void;
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
  onOpenFolder,
  onOpenSettings,
  onNewConversationForProject,
}: MainWorkspaceSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
      aria-hidden={!sidebarOpen}
      className={`flex shrink-0 overflow-hidden border-r transition-[width,border-color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] ${
        sidebarOpen ? "w-[280px] border-slate-200/90" : "w-0 border-transparent"
      } ${
        electronMacVibrancy
          ? "sidebar-translucent"
          : "bg-white/55 backdrop-blur-xl backdrop-saturate-150"
      }`}
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
            className={`flex min-w-0 flex-1 items-center pr-3 ${isMac ? "pl-0" : "px-3"} ${
              isMac ? macTitlebarContentOffsetClass : ""
            }`}
          >
            <SidebarToggleButton expanded onClick={onToggleSidebar} />
          </div>
        </div>

        <div className="app-region-no-drag scroll-viewport min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="relative mb-1 flex items-center justify-between px-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Projects
            </div>
            <button
              type="button"
              aria-label="Open project folder"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/10 hover:text-slate-800"
              onClick={onOpenFolder}
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.6} aria-hidden />
            </button>
          </div>

          {projectsLoading ? (
            <p className="mt-2 px-1 text-xs text-slate-500">Loading projects…</p>
          ) : projects.length === 0 ? (
            <p className="mt-2 px-1 text-xs text-slate-500">
              Open a folder to add a project and start chatting with Pi.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {projects.map((project) => {
                const expanded = expandedProjectCwds.has(project.cwd);
                const isSelectedProject = selectedProjectCwd === project.cwd;
                return (
                  <li key={project.cwd}>
                    <div className="app-region-no-drag flex h-10 w-full items-center rounded-md pr-2 transition-colors hover:bg-slate-900/10">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-1 text-left text-sm font-medium text-slate-800"
                        onClick={() => onToggleProjectExpanded(project.cwd)}
                      >
                        <HugeiconsIcon
                          icon={expanded ? FolderOpenIcon : Folder01Icon}
                          size={14}
                          strokeWidth={1.5}
                          className="shrink-0 text-slate-500"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`New conversation in ${project.name}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-900/10 hover:text-slate-700"
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

        <SidenavFooter onOpenFolder={onOpenFolder} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

export const MainWorkspaceSidebar = memo(MainWorkspaceSidebarInner);
