import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChatNotice } from "./components/ChatNotice";
import { Composer } from "./components/Composer";
import { ChatWorkspaceHeader } from "./components/main-workspace/ChatWorkspaceHeader";
import { MainWorkspaceSidebar } from "./components/sidenav/MainWorkspaceSidebar";
import { SettingsView } from "./components/settings/SettingsView";
import { UserMessageContent } from "./components/UserMessageContent";
import {
  cloneDraft,
  createEmptyDraft,
  serializeDraft,
  type ComposerSegment,
} from "./lib/composer-draft";
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
  removeConversationFromStorage,
} from "./lib/chat-storage";
import {
  collectStreamingConversationIds,
  createConversationRuntime,
  findConversationIdBySessionKey,
  type ConnectionStatus,
  type ConversationRuntime,
} from "./lib/conversation-runtime";
import { messagesToTimeline } from "./lib/messages-to-timeline";
import { getActiveChatNotice } from "./lib/harness-error-display";
import { buildSessionKey } from "./lib/session-key";
import { MarkdownContent } from "./components/MarkdownContent";
import { Thinking } from "./components/Thinking";
import { ToolActivity } from "./components/ToolActivity";
import type { ConversationSummary, HarnessState, ProjectSummary } from "../../preload/api";
import {
  appendThinking,
  applyHarnessEvent,
  createInitialTimelineState,
  nextId,
  type TimelineItem,
  type ToolActivityItem,
} from "./events";

export function App() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [runtimesVersion, setRuntimesVersion] = useState(0);
  const [draft, setDraft] = useState<ComposerSegment[]>(createEmptyDraft);
  const [streamingConversationIds, setStreamingConversationIds] = useState(
    () => new Set<string>(),
  );
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectCwds, setExpandedProjectCwds] = useState(() => new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMainSidebarToggle, setShowMainSidebarToggle] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openRouterConfigured, setOpenRouterConfigured] = useState<boolean | undefined>(
    undefined,
  );

  const runtimesRef = useRef(new Map<string, ConversationRuntime>());
  const activeConversationIdRef = useRef<string | null>(null);
  const viewGenerationRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const projectsHydratedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const contextRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const piSessionsRestartedRef = useRef(false);

  const bumpRuntimes = useCallback(() => {
    setRuntimesVersion((v) => v + 1);
    setStreamingConversationIds(collectStreamingConversationIds(runtimesRef.current));
  }, []);

  const activeRuntime = activeConversationId
    ? runtimesRef.current.get(activeConversationId)
    : undefined;

  const cwd = activeRuntime?.cwd ?? null;
  const selectedSessionFile = activeRuntime?.sessionFile ?? null;
  const selectedConversationId = activeRuntime?.conversationId ?? null;
  const timeline = activeRuntime?.timeline ?? createInitialTimelineState();
  const status = activeRuntime?.status ?? ("disconnected" as ConnectionStatus);
  const error = activeRuntime?.error ?? null;
  const chatNotice = getActiveChatNotice({
    projectOpen: cwd !== null,
    openRouterConfigured,
    runtimeError: error,
  });
  const isStreaming = activeRuntime?.isStreaming ?? false;
  const chatTitle = activeRuntime?.title ?? "OpenHarness";
  const activeSessionKey = activeRuntime?.sessionKey ?? null;

  const isMac = isMacUA && typeof window.harness !== "undefined";
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  const updateRuntime = useCallback(
    (conversationId: string, patch: Partial<ConversationRuntime>) => {
      const existing = runtimesRef.current.get(conversationId);
      if (!existing) return;
      runtimesRef.current.set(conversationId, { ...existing, ...patch });
      bumpRuntimes();
    },
    [bumpRuntimes],
  );

  const applySessionState = useCallback(
    (runtime: ConversationRuntime, state: { sessionFile?: string }) => {
      if (!state.sessionFile) return;
      runtime.sessionFile = state.sessionFile;
      runtime.sessionKey = buildSessionKey(runtime.cwd, {
        sessionFile: state.sessionFile,
        conversationId: runtime.conversationId,
      });
    },
    [],
  );

  const syncRuntimeToStorage = useCallback(async (runtime: ConversationRuntime) => {
    try {
      const messages = await window.harness.getMessages({ sessionKey: runtime.sessionKey });
      const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
      if (state) applySessionState(runtime, state);
      await persistConversation({
        projectCwd: runtime.cwd,
        sessionId: runtime.conversationId,
        sessionFile: state?.sessionFile ?? runtime.sessionFile,
        messages,
        clientId: runtime.conversationId,
        title: deriveTitleFromMessages(messages, runtime.title),
      });
      runtime.title = deriveTitleFromMessages(messages, runtime.title);
      bumpRuntimes();
    } catch {
      // Pi may not be running for this session yet.
    }
  }, [applySessionState, bumpRuntimes]);

  const refreshProjects = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true && projectsHydratedRef.current;
    if (!silent) setProjectsLoading(true);
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
      projectsHydratedRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (activeConversationIdRef.current) {
        updateRuntime(activeConversationIdRef.current, { error: message });
      }
    } finally {
      if (!silent) setProjectsLoading(false);
    }
  }, [updateRuntime]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const runtime = activeConversationId
      ? runtimesRef.current.get(activeConversationId)
      : undefined;
    setDraft(
      runtime?.composerDraft?.length
        ? cloneDraft(runtime.composerDraft)
        : createEmptyDraft(),
    );
  }, [activeConversationId]);

  const handleDraftChange = useCallback((segments: ComposerSegment[]) => {
    setDraft(segments);
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (runtime) {
      runtime.composerDraft = cloneDraft(segments);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const refreshAuthStatus = useCallback(async () => {
    try {
      const settings = await window.harness.getSettings();
      setOpenRouterConfigured(settings.openrouter.configured);
    } catch {
      setOpenRouterConfigured(undefined);
    }
  }, []);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  useEffect(() => {
    scrollToBottom();
  }, [timeline.items, scrollToBottom, runtimesVersion]);

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

    const unsubscribe = window.harness.onEvent(({ sessionKey, event }) => {
      const conversationId = findConversationIdBySessionKey(runtimesRef.current, sessionKey);
      if (!conversationId) return;

      const runtime = runtimesRef.current.get(conversationId);
      if (!runtime) return;

      runtime.timeline = applyHarnessEvent(runtime.timeline, event);
      const e = event as { type?: string; assistantMessageEvent?: { type?: string } };
      if (e.type === "agent_start") runtime.isStreaming = true;
      if (e.type === "agent_end" || e.type === "harness_exit") {
        runtime.isStreaming = false;
        if (e.type === "harness_exit") {
          runtime.status = "disconnected";
          runtime.timeline = {
            items: runtime.timeline.items.filter((item) => item.kind !== "thinking"),
          };
        }
      }
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "error") {
        runtime.isStreaming = false;
      }

      bumpRuntimes();

      const isActive = conversationId === activeConversationIdRef.current;
      if (e.type === "message_update" && isActive) {
        refreshContextUsageSoon();
      } else if (
        e.type === "agent_end" ||
        e.type === "message_end" ||
        e.type === "harness_exit"
      ) {
        if (isActive && contextRefreshTimeoutRef.current) {
          clearTimeout(contextRefreshTimeoutRef.current);
          contextRefreshTimeoutRef.current = null;
        }
        if (isActive) refreshContextUsage();
        if (e.type === "agent_end" || e.type === "message_end") {
          setConversationRefreshKey((k) => k + 1);
          void syncRuntimeToStorage(runtime);
          void refreshProjects({ silent: true });
        }
      }
    });

    return () => {
      if (contextRefreshTimeoutRef.current) {
        clearTimeout(contextRefreshTimeoutRef.current);
      }
      unsubscribe();
    };
  }, [bumpRuntimes, refreshProjects, syncRuntimeToStorage]);

  const attachRuntime = useCallback(
    (conversationId: string) => {
      activeConversationIdRef.current = conversationId;
      setActiveConversationId(conversationId);
      const runtime = runtimesRef.current.get(conversationId);
      if (runtime) {
        void window.harness.setActiveSession({ sessionKey: runtime.sessionKey });
      }
      bumpRuntimes();
    },
    [bumpRuntimes],
  );

  const reconnectRuntime = useCallback(
    async (runtime: ConversationRuntime, options?: { viewId?: number }) => {
      if (runtime.status === "connecting") return;

      const viewId = options?.viewId ?? viewGenerationRef.current;
      runtime.status = "connecting";
      runtime.error = null;
      runtime.isStreaming = false;
      bumpRuntimes();

      try {
        const { sessionKey: ensuredKey, messages: piMessages } = await window.harness.start({
          cwd: runtime.cwd,
          sessionFile: runtime.sessionFile ?? undefined,
          conversationId: runtime.conversationId,
        });
        if (options?.viewId !== undefined && viewId !== viewGenerationRef.current) return;

        runtime.sessionKey = ensuredKey;

        if (!runtime.sessionFile) {
          const cachedMessages = await getStoredMessages(null, runtime.conversationId);
          const isEmpty =
            !cachedMessages?.length && runtime.timeline.items.length === 0;
          if (isEmpty) {
            const response = await window.harness.newSession({ sessionKey: ensuredKey });
            if (!response.success) {
              throw new Error(response.error ?? "Could not start a new conversation");
            }
          }
        } else if (piMessages?.length) {
          runtime.timeline = messagesToTimeline(piMessages);
        }

        const state = await window.harness.getState({ sessionKey: ensuredKey });
        if (state) applySessionState(runtime, state);

        runtime.status = "connected";
        void window.harness.setActiveSession({ sessionKey: ensuredKey });
        setContextRefreshKey((key) => key + 1);
        bumpRuntimes();
      } catch (err) {
        runtime.status = "error";
        runtime.error = err instanceof Error ? err.message : String(err);
        bumpRuntimes();
      }
    },
    [applySessionState, bumpRuntimes],
  );

  const loadConversation = useCallback(
    async (
      projectCwd: string,
      options?: { sessionFile?: string; sessionId?: string; title?: string },
    ) => {
      const viewId = ++viewGenerationRef.current;
      const conversationId = options?.sessionId ?? crypto.randomUUID();
      const sessionFile = options?.sessionFile || undefined;

      const existing = runtimesRef.current.get(conversationId);
      if (existing) {
        attachRuntime(conversationId);
        if (existing.status === "disconnected" || existing.status === "error") {
          void reconnectRuntime(existing, { viewId });
        }
        return;
      }

      const cachedMessages = await getStoredMessages(sessionFile ?? null, conversationId);
      if (viewId !== viewGenerationRef.current) return;

      const initialTimeline = cachedMessages?.length
        ? messagesToTimeline(cachedMessages)
        : createInitialTimelineState();
      const title =
        options?.title ?? deriveTitleFromMessages(cachedMessages, "New conversation");

      const sessionKey = buildSessionKey(projectCwd, {
        sessionFile: sessionFile ?? null,
        conversationId,
      });

      const runtime = createConversationRuntime({
        conversationId,
        sessionKey,
        cwd: projectCwd,
        sessionFile: sessionFile ?? null,
        title,
        timeline: initialTimeline,
        status: "connecting",
      });
      runtimesRef.current.set(conversationId, runtime);
      attachRuntime(conversationId);

      setExpandedProjectCwds((prev) => {
        if (prev.has(projectCwd)) return prev;
        const next = new Set(prev);
        next.add(projectCwd);
        return next;
      });

      try {
        const { sessionKey: ensuredKey, messages: piMessages } = await window.harness.start({
          cwd: projectCwd,
          sessionFile,
          conversationId,
        });
        if (viewId !== viewGenerationRef.current) return;

        runtime.sessionKey = ensuredKey;
        let messages: unknown[] | null;
        if (!sessionFile) {
          const isNewDraft = !cachedMessages?.length;
          if (isNewDraft) {
            await window.harness.newSession({ sessionKey: ensuredKey });
            if (viewId !== viewGenerationRef.current) return;
          }
          messages = cachedMessages ?? [];
        } else {
          messages = piMessages?.length
            ? piMessages
            : await getStoredMessages(sessionFile, conversationId);
        }
        if (viewId !== viewGenerationRef.current) return;

        runtime.timeline = messagesToTimeline(messages);
        runtime.title = options?.title ?? deriveTitleFromMessages(messages, "New conversation");
        runtime.status = "connected";
        runtime.sessionKey = ensuredKey;

        const state = await window.harness.getState({ sessionKey: ensuredKey });
        if (state) applySessionState(runtime, state);

        attachRuntime(conversationId);
        setContextRefreshKey((key) => key + 1);
        void rememberProject(projectCwd);
        void persistConversation({
          projectCwd,
          sessionId: conversationId,
          sessionFile: runtime.sessionFile,
          messages,
          clientId: conversationId,
          touchUpdatedAt: false,
        });
      } catch (err) {
        if (viewId !== viewGenerationRef.current) return;
        runtime.status = "error";
        runtime.error = err instanceof Error ? err.message : String(err);
        bumpRuntimes();
      }
    },
    [applySessionState, attachRuntime, bumpRuntimes, reconnectRuntime],
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
      if (!latest) return;
      await loadConversation(lastCwd, {
        sessionFile: latest.sessionFile || undefined,
        sessionId: latest.sessionId,
        title: latest.title,
      });
    })();
  }, [loadConversation]);

  const handleOpenFolder = useCallback(async () => {
    const result = await window.harness.pickDirectory();
    if (result.canceled) return;
    void refreshAuthStatus();
    const clientId = crypto.randomUUID();
    await loadConversation(result.cwd, { sessionId: clientId, title: "New conversation" });
  }, [loadConversation, refreshAuthStatus]);

  const handleSelectConversation = useCallback(
    async (projectCwd: string, conversation: ConversationSummary) => {
      const active = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      const sameSession =
        conversation.sessionFile &&
        active?.sessionFile === conversation.sessionFile;
      const sameDraft =
        !conversation.sessionFile &&
        active?.conversationId === conversation.sessionId;
      if (projectCwd === active?.cwd && (sameSession || sameDraft)) return;

      await loadConversation(projectCwd, {
        sessionFile: conversation.sessionFile || undefined,
        sessionId: conversation.sessionId,
        title: conversation.title,
      });
    },
    [loadConversation],
  );

  const handleArchiveConversation = useCallback(
    async (_projectCwd: string, conversation: ConversationSummary) => {
      await removeConversationFromStorage(conversation.sessionId);
      runtimesRef.current.delete(conversation.sessionId);

      if (activeConversationIdRef.current === conversation.sessionId) {
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
      }

      bumpRuntimes();
      setConversationRefreshKey((k) => k + 1);
      void refreshProjects({ silent: true });
    },
    [bumpRuntimes, refreshProjects],
  );

  const handleNewConversation = useCallback(
    async (projectCwd: string) => {
      void refreshAuthStatus();
      const viewId = ++viewGenerationRef.current;
      const clientId = crypto.randomUUID();
      const sessionKey = buildSessionKey(projectCwd, { conversationId: clientId });

      const runtime = createConversationRuntime({
        conversationId: clientId,
        sessionKey,
        cwd: projectCwd,
        title: "New conversation",
        status: "connecting",
      });
      runtimesRef.current.set(clientId, runtime);
      attachRuntime(clientId);

      try {
        const { sessionKey: ensuredKey } = await window.harness.start({
          cwd: projectCwd,
          conversationId: clientId,
        });
        if (viewId !== viewGenerationRef.current) return;

        runtime.sessionKey = ensuredKey;
        const response = await window.harness.newSession({ sessionKey: ensuredKey });
        if (!response.success) {
          throw new Error(response.error ?? "Could not start a new conversation");
        }
        if (viewId !== viewGenerationRef.current) return;

        runtime.status = "connected";
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
        setConversationRefreshKey((k) => k + 1);
        void refreshProjects({ silent: true });
        bumpRuntimes();
      } catch (err) {
        if (viewId !== viewGenerationRef.current) return;
        runtime.status = "error";
        runtime.error = err instanceof Error ? err.message : String(err);
        bumpRuntimes();
      }
    },
    [attachRuntime, bumpRuntimes, refreshAuthStatus, refreshProjects],
  );

  const toggleProjectExpanded = useCallback((projectCwd: string) => {
    setExpandedProjectCwds((prev) => {
      const next = new Set(prev);
      if (next.has(projectCwd)) next.delete(projectCwd);
      else next.add(projectCwd);
      return next;
    });
  }, []);

  const clearThinking = (runtime: ConversationRuntime) => {
    runtime.timeline = {
      items: runtime.timeline.items.filter((item) => item.kind !== "thinking"),
    };
  };

  const handleSend = async () => {
    const text = serializeDraft(draft);
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (!text || !runtime || runtime.status !== "connected") return;

    const empty = createEmptyDraft();
    setDraft(empty);
    runtime.composerDraft = empty;
    const steer = runtime.isStreaming;
    runtime.timeline = appendThinking({
      items: [...runtime.timeline.items, { kind: "user", id: nextId("user"), content: text }],
    });
    runtime.isStreaming = true;
    runtime.error = null;
    bumpRuntimes();

    try {
      const settings = await window.harness.getSettings();
      setOpenRouterConfigured(settings.openrouter.configured);
      if (!settings.openrouter.configured) {
        runtime.isStreaming = false;
        clearThinking(runtime);
        bumpRuntimes();
        return;
      }

      const response = await window.harness.prompt({
        sessionKey: runtime.sessionKey,
        message: text,
        ...(steer ? { streamingBehavior: "steer" as const } : {}),
      });
      if (!response.success) {
        runtime.error = response.error ?? "Prompt rejected";
        runtime.isStreaming = false;
        clearThinking(runtime);
        bumpRuntimes();
      } else {
        const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
        if (state) {
          applySessionState(runtime, state);
          runtime.isStreaming = state.isStreaming;
        }
        bumpRuntimes();
        void syncRuntimeToStorage(runtime);
      }
    } catch (err) {
      runtime.error = err instanceof Error ? err.message : String(err);
      runtime.isStreaming = false;
      clearThinking(runtime);
      bumpRuntimes();
    }
  };

  const handleSessionStateSynced = useCallback(
    (_sessionKey: string, state: HarnessState | null): void => {
      const conversationId = activeConversationIdRef.current;
      if (!conversationId || !state) return;
      const runtime = runtimesRef.current.get(conversationId);
      if (!runtime) return;
      const prevKey = runtime.sessionKey;
      applySessionState(runtime, state);
      if (runtime.sessionKey !== prevKey) bumpRuntimes();
    },
    [applySessionState, bumpRuntimes],
  );

  const handleDismissError = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    updateRuntime(conversationId, { error: null });
  }, [updateRuntime]);

  const handleAbort = async () => {
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (!runtime) return;

    try {
      await window.harness.abort({ sessionKey: runtime.sessionKey });
      runtime.isStreaming = false;
      runtime.timeline = {
        items: runtime.timeline.items.map((item) =>
          item.kind === "assistant" && item.streaming ? { ...item, streaming: false } : item,
        ),
      };
      bumpRuntimes();
    } catch (err) {
      runtime.error = err instanceof Error ? err.message : String(err);
      bumpRuntimes();
    }
  };

  const handleSettingsChanged = useCallback(() => {
    piSessionsRestartedRef.current = true;
    void refreshProjects({ silent: true });
    void refreshAuthStatus();
  }, [refreshAuthStatus, refreshProjects]);

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    if (!piSessionsRestartedRef.current) return;
    piSessionsRestartedRef.current = false;

    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime) return;
    void reconnectRuntime(runtime);
  }, [reconnectRuntime]);

  if (settingsOpen) {
    return (
      <SettingsView
        onClose={handleSettingsClose}
        onSettingsChanged={handleSettingsChanged}
      />
    );
  }

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
          streamingConversationIds={streamingConversationIds}
          onSelectConversation={handleSelectConversation}
          onArchiveConversation={handleArchiveConversation}
          onOpenFolder={handleOpenFolder}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewConversationForProject={handleNewConversation}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <ChatWorkspaceHeader
            title={chatTitle}
            isMac={isMac}
            showSidebarToggle={!sidebarOpen && showMainSidebarToggle}
            onToggleSidebar={toggleSidebar}
          />

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
                notice={
                  chatNotice ? (
                    <ChatNotice
                      error={chatNotice}
                      onOpenSettings={() => setSettingsOpen(true)}
                      onDismiss={
                        chatNotice.code === "missing_api_key" ? undefined : handleDismissError
                      }
                    />
                  ) : null
                }
                segments={draft}
                onSegmentsChange={handleDraftChange}
                onSend={() => void handleSend()}
                onAbort={() => void handleAbort()}
                noProject={cwd === null}
                sessionPending={cwd !== null && status !== "connected"}
                apiKeyRequired={chatNotice?.code === "missing_api_key"}
                isStreaming={isStreaming}
                projectReady={status === "connected" && cwd !== null}
                sessionKey={activeSessionKey}
                contextRefreshKey={contextRefreshKey}
                onModelChange={() => setContextRefreshKey((k) => k + 1)}
                onSessionStateSynced={handleSessionStateSynced}
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
