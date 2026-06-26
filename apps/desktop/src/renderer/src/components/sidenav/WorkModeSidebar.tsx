import { Add01Icon, Folder01Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useEffect, useState, type RefObject } from "react";
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
import {
  listWorkConversationsFromStorage,
  listWorkProjectsFromStorage,
} from "../../lib/chat-storage";
import { isStreamingConversation } from "../../lib/is-streaming-conversation";
import { mergeConversationOrder } from "../../lib/merge-conversation-order";
import { ConversationListRow } from "./ConversationListRow";
import { ProjectConversationList } from "./ProjectConversationList";
import { ProjectRowMenu } from "./ProjectRowMenu";
import { SidenavFooter } from "./SidenavFooter";

type WorkModeSidebarProps = {
  sidebarRef: RefObject<HTMLElement | null>;
  sidebarOpen: boolean;
  isMac: boolean;
  onToggleSidebar: () => void;
  selectedProjectCwd: string | null;
  selectedSessionFile: string | null;
  selectedConversationId: string | null;
  conversationRefreshKey: number;
  workProjectsRefreshKey: number;
  streamingConversationIds: ReadonlySet<string>;
  expandedProjectCwds: ReadonlySet<string>;
  onToggleProjectExpanded: (cwd: string) => void;
  onSelectChat: (conversation: ConversationSummary) => void;
  onSelectProjectConversation: (projectCwd: string, conversation: ConversationSummary) => void;
  onArchiveChat: (conversation: ConversationSummary) => void;
  onArchiveProjectConversation: (projectCwd: string, conversation: ConversationSummary) => void;
  onArchiveAllChats: (projectCwd: string) => void;
  onRemoveProject: (projectCwd: string) => void;
  onNewChat: () => void;
  onNewProject: () => void;
  onNewConversationForProject: (cwd: string) => void;
  onOpenSettings: (section?: SettingsSection) => void;
  tokensRefreshKey: number;
};

function WorkModeSidebarInner({
  sidebarRef,
  sidebarOpen,
  isMac,
  onToggleSidebar,
  selectedProjectCwd,
  selectedSessionFile,
  selectedConversationId,
  conversationRefreshKey,
  workProjectsRefreshKey,
  streamingConversationIds,
  expandedProjectCwds,
  onToggleProjectExpanded,
  onSelectChat,
  onSelectProjectConversation,
  onArchiveChat,
  onArchiveProjectConversation,
  onArchiveAllChats,
  onRemoveProject,
  onNewChat,
  onNewProject,
  onNewConversationForProject,
  onOpenSettings,
  tokensRefreshKey,
}: WorkModeSidebarProps) {
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    const showLoadingPlaceholder = chats.length === 0;
    if (showLoadingPlaceholder) {
      setChatsLoading(true);
      setChatsError(null);
    }
    void listWorkConversationsFromStorage()
      .then((rows) => {
        if (!cancelled) {
          setChats((previous) => mergeConversationOrder(previous, rows));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setChatsError(err instanceof Error ? err.message : String(err));
          if (showLoadingPlaceholder) setChats([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    const showLoadingPlaceholder = projects.length === 0;
    if (showLoadingPlaceholder) {
      setProjectsLoading(true);
      setProjectsError(null);
    }
    void listWorkProjectsFromStorage()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err.message : String(err));
          if (showLoadingPlaceholder) setProjects([]);
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workProjectsRefreshKey]);

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
                  aria-label="New chat"
                  className={`app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-800 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover}`}
                  onClick={onNewChat}
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.7} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="New project"
                  className={`app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-800 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover}`}
                  onClick={onNewProject}
                >
                  <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.7} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New project</TooltipContent>
            </Tooltip>
            <UpdateInstallButton className="app-region-no-drag ml-auto" />
          </div>
        </div>

        <div className="app-region-no-drag sidenav-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          <section className="sidenav-section">
            <h3 className="sidenav-section-label">Chats</h3>
            {chatsLoading ? (
              <p className="mt-1 px-2 text-xs text-slate-500 dark:text-slate-400">Loading…</p>
            ) : chatsError ? (
              <p className="mt-1 px-2 text-xs text-red-600 dark:text-red-400">{chatsError}</p>
            ) : chats.length === 0 ? (
              <p className="mt-1 px-2 text-xs text-slate-500 dark:text-slate-400">
                Start a new chat for everyday work.
              </p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {chats.map((conversation) => {
                  const selected =
                    selectedProjectCwd === null &&
                    (conversation.sessionFile
                      ? selectedSessionFile === conversation.sessionFile
                      : selectedConversationId === conversation.sessionId);
                  const streaming = isStreamingConversation(conversation, streamingConversationIds);
                  return (
                    <ConversationListRow
                      key={conversation.sessionId}
                      conversation={conversation}
                      selected={selected}
                      streaming={streaming}
                      onSelect={() => onSelectChat(conversation)}
                      onArchive={() => onArchiveChat(conversation)}
                    />
                  );
                })}
              </ul>
            )}
          </section>

          <section className="sidenav-section mt-4">
            <h3 className="sidenav-section-label">Projects</h3>
            {projectsLoading ? (
              <p className="mt-1 px-2 text-xs text-slate-500 dark:text-slate-400">Loading…</p>
            ) : projectsError ? (
              <p className="mt-1 px-2 text-xs text-red-600 dark:text-red-400">{projectsError}</p>
            ) : projects.length === 0 ? (
              <p className="mt-1 px-2 text-xs text-slate-500 dark:text-slate-400">
                Add a folder to work with files in a project.
              </p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
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
                          showGithubActions={false}
                          onArchiveAllChats={() => onArchiveAllChats(project.cwd)}
                          onRemoveProject={() => onRemoveProject(project.cwd)}
                          onConnectGithub={() => {}}
                          onDisconnectGithub={() => {}}
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
                        conversationScope="work-project"
                        selectedSessionFile={isSelectedProject ? selectedSessionFile : null}
                        selectedConversationId={isSelectedProject ? selectedConversationId : null}
                        refreshKey={conversationRefreshKey}
                        streamingConversationIds={streamingConversationIds}
                        onSelectConversation={onSelectProjectConversation}
                        onArchiveConversation={onArchiveProjectConversation}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <SidenavFooter
          tokensRefreshKey={tokensRefreshKey}
          onOpenFolder={onNewProject}
          onOpenSettings={onOpenSettings}
          showOpenFolder={false}
        />
      </div>
    </aside>
  );
}

export const WorkModeSidebar = memo(WorkModeSidebarInner);
