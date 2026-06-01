import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Composer, createEmptyDraft } from "./components/Composer";
import { ChatWorkspaceHeader } from "./components/main-workspace/ChatWorkspaceHeader";
import { MainWorkspaceSidebar } from "./components/sidenav/MainWorkspaceSidebar";
import { UserMessageContent } from "./components/UserMessageContent";
import { serializeDraft, type ComposerSegment } from "./lib/composer-draft";
import {
  electronMacVibrancy,
  isMacUA,
  mainSidebarToggleDelayMs,
} from "./components/main-workspace/constants";
import {
  deriveTitleFromMessages,
  getStoredMessages,
  listConversationsFromStorage,
  listProjectsFromStorage,
  migrateFromPiSessionsIfEmpty,
  persistConversation,
  rememberProject,
} from "./lib/chat-storage";
import { messagesToTimeline } from "./lib/messages-to-timeline";
import { MarkdownContent } from "./components/MarkdownContent";
import { Thinking } from "./components/Thinking";
import { ToolActivity } from "./components/ToolActivity";
import type { ConversationSummary, ProjectSummary } from "../../preload/api";
import {
  appendThinking,
  applyHarnessEvent,
  createInitialTimelineState,
  nextId,
  type TimelineItem,
  type TimelineState,
  type ToolActivityItem,
} from "./events";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [cwd, setCwd] = useState<string | null>(null);
  const [selectedSessionFile, setSelectedSessionFile] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineState>(createInitialTimelineState);
  const [draft, setDraft] = useState<ComposerSegment[]>(createEmptyDraft);
  const [isStreaming, setIsStreaming] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectCwds, setExpandedProjectCwds] = useState(() => new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMainSidebarToggle, setShowMainSidebarToggle] = useState(false);
  const [chatTitle, setChatTitle] = useState("OpenHarness");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const contextRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenerationRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const activeClientIdRef = useRef<string | null>(null);

  const isMac = isMacUA && typeof window.harness !== "undefined";
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  const syncConversationToStorage = useCallback(async () => {
    if (!cwd) return;
    try {
      const messages = await window.harness.getMessages();
      const state = await window.harness.getState();
      const id = await persistConversation({
        projectCwd: cwd,
        sessionId: state?.sessionId,
        sessionFile: state?.sessionFile ?? selectedSessionFile,
        messages,
        clientId: activeClientIdRef.current ?? undefined,
      });
      activeClientIdRef.current = id;
      if (state?.sessionId) setSelectedConversationId(state.sessionId);
    } catch {
      // Pi may not be running yet; ignore until connected.
    }
  }, [cwd, selectedSessionFile]);

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      await migrateFromPiSessionsIfEmpty();
      const stored = await listProjectsFromStorage();
      const fromHarness = await window.harness.listProjects();
      const byCwd = new Map(stored.map((p) => [p.cwd, p] as const));

      for (const project of fromHarness) {
        const existing = byCwd.get(project.cwd);
        if (!existing) {
          byCwd.set(project.cwd, project);
          await rememberProject(project.cwd, project.lastActivityAt);
          continue;
        }
        existing.conversationCount = Math.max(
          existing.conversationCount,
          project.conversationCount,
        );
        if (
          project.lastActivityAt &&
          (!existing.lastActivityAt || project.lastActivityAt > existing.lastActivityAt)
        ) {
          existing.lastActivityAt = project.lastActivityAt;
        }
      }

      const merged = [...byCwd.values()].sort((a, b) => {
        const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return tb - ta;
      });
      setProjects(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    scrollToBottom();
  }, [timeline.items, scrollToBottom]);

  useEffect(() => {
    const sidebar = sidebarRef.current as (HTMLElement & { inert?: boolean }) | null;
    if (!sidebar) return;
    sidebar.inert = !sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      setShowMainSidebarToggle(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowMainSidebarToggle(true);
    }, mainSidebarToggleDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [sidebarOpen]);

  useEffect(() => {
    const refreshContextUsage = () => {
      setContextRefreshKey((key) => key + 1);
    };
    const refreshContextUsageSoon = () => {
      if (contextRefreshTimeoutRef.current) {
        clearTimeout(contextRefreshTimeoutRef.current);
      }
      contextRefreshTimeoutRef.current = setTimeout(() => {
        contextRefreshTimeoutRef.current = null;
        refreshContextUsage();
      }, 400);
    };

    const unsubscribe = window.harness.onEvent((event) => {
      setTimeline((prev) => applyHarnessEvent(prev, event));
      const e = event as { type?: string; assistantMessageEvent?: { type?: string } };
      if (e.type === "agent_start") setIsStreaming(true);
      if (e.type === "agent_end" || e.type === "harness_exit") setIsStreaming(false);
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "error") {
        setIsStreaming(false);
      }
      if (e.type === "message_update") {
        refreshContextUsageSoon();
      } else if (
        e.type === "agent_end" ||
        e.type === "message_end" ||
        e.type === "harness_exit"
      ) {
        if (contextRefreshTimeoutRef.current) {
          clearTimeout(contextRefreshTimeoutRef.current);
          contextRefreshTimeoutRef.current = null;
        }
        refreshContextUsage();
        if (e.type === "agent_end" || e.type === "message_end") {
          setConversationRefreshKey((k) => k + 1);
          void syncConversationToStorage();
          void refreshProjects();
        }
      }
    });
    return () => {
      if (contextRefreshTimeoutRef.current) {
        clearTimeout(contextRefreshTimeoutRef.current);
      }
      unsubscribe();
    };
  }, [refreshProjects, syncConversationToStorage]);

  const loadConversation = useCallback(
    async (
      projectCwd: string,
      options?: { sessionFile?: string; sessionId?: string; title?: string },
    ) => {
      const loadId = ++loadGenerationRef.current;
      const sessionFile = options?.sessionFile || undefined;
      setStatus("connecting");
      setError(null);
      setTimeline(createInitialTimelineState());
      try {
        const { messages: piMessages } = await window.harness.start({
          cwd: projectCwd,
          sessionFile,
        });
        if (loadId !== loadGenerationRef.current) return;

        let messages = piMessages;
        if (!messages?.length) {
          messages = await getStoredMessages(sessionFile ?? null, options?.sessionId ?? null);
        }

        setCwd(projectCwd);
        setSelectedSessionFile(sessionFile ?? null);
        setSelectedConversationId(options?.sessionId ?? null);
        activeClientIdRef.current = options?.sessionId ?? null;
        setExpandedProjectCwds((prev) => {
          const next = new Set(prev);
          next.add(projectCwd);
          return next;
        });

        setTimeline(messagesToTimeline(messages));
        setChatTitle(options?.title ?? deriveTitleFromMessages(messages, "New conversation"));
        setStatus("connected");
        setContextRefreshKey((key) => key + 1);
        setConversationRefreshKey((k) => k + 1);
        await rememberProject(projectCwd);
        await persistConversation({
          projectCwd,
          sessionId: options?.sessionId,
          sessionFile: sessionFile ?? null,
          messages,
          clientId: options?.sessionId,
          touchUpdatedAt: false,
        });
        void refreshProjects();
      } catch (err) {
        if (loadId !== loadGenerationRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshProjects],
  );

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    void (async () => {
      await migrateFromPiSessionsIfEmpty();
      const lastCwd = await window.harness.getLastCwd();
      if (!lastCwd) return;
      const conversations = await listConversationsFromStorage(lastCwd);
      const latest = conversations[0];
      await loadConversation(lastCwd, {
        sessionFile: latest?.sessionFile || undefined,
        sessionId: latest?.sessionId,
        title: latest?.title,
      });
    })();
  }, [loadConversation]);

  const handleOpenFolder = async () => {
    const result = await window.harness.pickDirectory();
    if (result.canceled) return;
    await loadConversation(result.cwd);
  };

  const handleSelectConversation = async (
    projectCwd: string,
    conversation: ConversationSummary,
  ) => {
    const sameSession =
      conversation.sessionFile &&
      conversation.sessionFile === selectedSessionFile;
    const sameDraft =
      !conversation.sessionFile &&
      conversation.sessionId === selectedConversationId;
    if (projectCwd === cwd && (sameSession || sameDraft)) return;
    await loadConversation(projectCwd, {
      sessionFile: conversation.sessionFile || undefined,
      sessionId: conversation.sessionId,
      title: conversation.title,
    });
  };

  const handleNewConversation = async (projectCwd: string) => {
    const loadId = ++loadGenerationRef.current;
    setStatus("connecting");
    setError(null);
    setTimeline(createInitialTimelineState());
    try {
      await window.harness.start({ cwd: projectCwd });
      if (loadId !== loadGenerationRef.current) return;
      const response = await window.harness.newSession();
      if (!response.success) {
        throw new Error(response.error ?? "Could not start a new conversation");
      }
      const clientId = crypto.randomUUID();
      activeClientIdRef.current = clientId;
      setCwd(projectCwd);
      setSelectedSessionFile(null);
      setSelectedConversationId(clientId);
      setChatTitle("New conversation");
      await persistConversation({
        projectCwd,
        clientId,
        messages: [],
        sessionFile: null,
      });
      setExpandedProjectCwds((prev) => {
        const next = new Set(prev);
        next.add(projectCwd);
        return next;
      });
      setStatus("connected");
      setConversationRefreshKey((k) => k + 1);
      void refreshProjects();
    } catch (err) {
      if (loadId !== loadGenerationRef.current) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleProjectExpanded = (projectCwd: string) => {
    setExpandedProjectCwds((prev) => {
      const next = new Set(prev);
      if (next.has(projectCwd)) next.delete(projectCwd);
      else next.add(projectCwd);
      return next;
    });
  };

  const handleSend = async () => {
    const text = serializeDraft(draft);
    if (!text || status !== "connected") return;

    setDraft(createEmptyDraft());
    setTimeline((prev) =>
      appendThinking({
        items: [...prev.items, { kind: "user", id: nextId("user"), content: text }],
      }),
    );
    setIsStreaming(true);
    setError(null);

    try {
      const response = await window.harness.prompt({
        message: text,
        ...(isStreaming ? { streamingBehavior: "steer" as const } : {}),
      });
      if (!response.success) {
        setError(response.error ?? "Prompt rejected");
        setIsStreaming(false);
      } else {
        const state = await window.harness.getState();
        if (state) {
          setIsStreaming(state.isStreaming);
          if (state.sessionFile) setSelectedSessionFile(state.sessionFile);
          if (state.sessionId) setSelectedConversationId(state.sessionId);
        }
        void syncConversationToStorage();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsStreaming(false);
    }
  };

  const handleAbort = async () => {
    try {
      await window.harness.abort();
      setIsStreaming(false);
      setTimeline((prev) => ({
        items: prev.items.map((item) =>
          item.kind === "assistant" && item.streaming ? { ...item, streaming: false } : item,
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className={`flex h-screen min-h-0 flex-col text-slate-900 ${
        electronMacVibrancy ? "bg-transparent" : "bg-slate-50"
      }`}
    >
      <div className="flex min-h-0 flex-1">
        <MainWorkspaceSidebar
          sidebarRef={sidebarRef}
          sidebarOpen={sidebarOpen}
          isMac={isMac}
          onToggleSidebar={toggleSidebar}
          projects={projects}
          projectsLoading={projectsLoading}
          expandedProjectCwds={expandedProjectCwds}
          onToggleProjectExpanded={toggleProjectExpanded}
          selectedProjectCwd={cwd}
          selectedSessionFile={selectedSessionFile}
          selectedConversationId={selectedConversationId}
          conversationRefreshKey={conversationRefreshKey}
          onSelectConversation={(projectCwd, conversation) => {
            void handleSelectConversation(projectCwd, conversation);
          }}
          onOpenFolder={() => void handleOpenFolder()}
          onNewConversationForProject={(projectCwd) => {
            void handleNewConversation(projectCwd);
          }}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <ChatWorkspaceHeader
            title={chatTitle}
            isMac={isMac}
            showSidebarToggle={!sidebarOpen && showMainSidebarToggle}
            onToggleSidebar={toggleSidebar}
          />

          {error ? (
            <div className="error-banner app-region-no-drag shrink-0">{error}</div>
          ) : null}

          <div className="chat-workspace app-region-no-drag">
            <div className="chat-scroll scroll-viewport">
              <div className="chat-column">
                {timeline.items.length === 0 ? (
                  <div className="empty-state">
                    <p>
                      {cwd
                        ? "Send a message to start the conversation."
                        : "Select a project and conversation, or open a folder from the sidebar."}
                    </p>
                  </div>
                ) : (
                  <div className="messages-stack">
                    <div className="messages-spacer" aria-hidden="true" />
                    <div className="messages-flow">
                      {renderTimelineRows(timeline.items)}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="chat-composer-host">
              <Composer
                segments={draft}
                onSegmentsChange={setDraft}
                onSend={() => void handleSend()}
                onAbort={() => void handleAbort()}
                disabled={status !== "connected"}
                isStreaming={isStreaming}
                projectReady={status === "connected" && cwd !== null}
                contextRefreshKey={contextRefreshKey}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function renderTimelineRows(items: TimelineItem[]) {
  const rows: ReactNode[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];
    if (item.kind === "tool-activity") {
      const group: ToolActivityItem[] = [];
      while (index < items.length && items[index].kind === "tool-activity") {
        group.push(items[index] as ToolActivityItem);
        index += 1;
      }
      rows.push(
        <div key={group[0].id} className="tool-activity-group">
          {group.map((activity) => (
            <ToolActivity key={activity.id} activity={activity} />
          ))}
        </div>,
      );
      continue;
    }

    rows.push(<TimelineRow key={item.id} item={item} />);
    index += 1;
  }

  return rows;
}

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === "thinking") {
    return <Thinking />;
  }

  if (item.kind === "tool-activity") {
    return <ToolActivity activity={item} />;
  }

  if (item.kind === "user") {
    return (
      <div className="message message-user">
        <div className="message-content">
          <UserMessageContent content={item.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="message message-assistant">
      <div className="message-content">
        <MarkdownContent content={item.content} />
        {item.streaming && <span className="cursor">▋</span>}
      </div>
    </div>
  );
}
