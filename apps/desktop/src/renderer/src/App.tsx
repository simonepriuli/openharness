import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatNotice } from "./components/ChatNotice";
import { Composer } from "./components/Composer";
import { ChatWorkspaceHeader } from "./components/main-workspace/ChatWorkspaceHeader";
import { MainWorkspaceSidebar } from "./components/sidenav/MainWorkspaceSidebar";
import { SettingsView } from "./components/settings/SettingsView";
import type { SettingsSection } from "./components/settings/SettingsNav";
import { UserMessageContent } from "./components/UserMessageContent";
import {
  cloneDraft,
  createEmptyDraft,
  extractImagesFromDraft,
  revokeDraftPreviewUrls,
  serializeDraft,
  type ComposerSegment,
  type DraftImageContent,
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
  archiveAllConversationsForProject,
  removeProjectFromStorage,
  updateConversationTitle,
} from "./lib/chat-storage";
import {
  collectStreamingConversationIds,
  createConversationRuntime,
  findConversationIdBySessionKey,
  reconcileRuntimeSessionKey,
  runtimeIsStreaming,
  type ConnectionStatus,
  type ConversationRuntime,
} from "./lib/conversation-runtime";
import { messagesToTimeline } from "./lib/messages-to-timeline";
import { useHarnessMenuActions } from "./hooks/useHarnessMenuActions";
import { collectEditedFilePaths } from "./lib/thread-git-paths";
import { getActiveChatNotice } from "./lib/harness-error-display";
import { buildSessionKey } from "./lib/session-key";
import {
  buildPendingQuestionResponse,
  parseExtensionUiSelectSnapshot,
  parsePendingQuestionFromTool,
  withQuestionIndex,
  withQuestionSelection,
} from "./lib/pending-question";
import { MarkdownContent } from "./components/MarkdownContent";
import { NewModelsNotice } from "./components/NewModelsNotice";
import { Thinking } from "./components/Thinking";
import { ReasoningBlock } from "./components/ReasoningBlock";
import { ToolActivity } from "./components/ToolActivity";
import { FileEditsSummary } from "./components/FileEditsSummary";
import { ToolExploreGroup, VISIBLE_EXPLORE_COUNT } from "./components/ToolExploreGroup";
import { ToolLine } from "./components/ToolLine";
import type { ConversationSummary, HarnessState, ProjectSummary } from "../../preload/api";
import {
  appendThinking,
  applyHarnessEvent,
  createInitialTimelineState,
  finalizeTimeline,
  nextId,
  prepareTimelineForDisplay,
  type TimelineItem,
  type ReasoningItem,
  type ToolLineItem,
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
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSection>("general");
  const [canSendMessages, setCanSendMessages] = useState<boolean | undefined>(undefined);
  const [chatVisibleModels, setChatVisibleModels] = useState<string[]>([]);
  const [creditsRefreshKey, setCreditsRefreshKey] = useState(0);
  const [gitStatsRefreshKey, setGitStatsRefreshKey] = useState(0);

  const runtimesRef = useRef(new Map<string, ConversationRuntime>());
  const activeConversationIdRef = useRef<string | null>(null);
  const viewGenerationRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const projectsHydratedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const contextRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const piSessionsRestartedRef = useRef(false);
  const swarmToggleInFlightRef = useRef<Promise<void> | null>(null);
  const sendInFlightRef = useRef(false);
  const titleGenerationRef = useRef(new Map<string, Promise<void>>());
  const titleGeneratedSetRef = useRef(new Set<string>());

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
    canSendMessages,
    runtimeError: error,
  });
  const isStreaming = activeRuntime ? runtimeIsStreaming(activeRuntime) : false;
  const chatTitle = activeRuntime?.title ?? "OpenHarness";
  const activeSessionKey = activeRuntime?.sessionKey ?? null;
  const swarmMode = activeRuntime?.swarmMode ?? false;
  const pendingQuestion = activeRuntime?.pendingQuestion ?? null;
  const editedFilePaths = useMemo(
    () => collectEditedFilePaths(activeRuntime?.timeline.items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRuntime?.timeline.items, runtimesVersion, gitStatsRefreshKey],
  );

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
    (runtime: ConversationRuntime, state: { sessionFile?: string; swarmMode?: boolean }) => {
      if (typeof state.swarmMode === "boolean") {
        runtime.swarmMode = state.swarmMode;
      }
      if (!state.sessionFile) return;
      runtime.sessionFile = state.sessionFile;
      runtime.sessionKey = buildSessionKey(runtime.cwd, {
        sessionFile: state.sessionFile,
        conversationId: runtime.conversationId,
      });
    },
    [],
  );

  const syncRuntimeToStorage = useCallback(
    async (runtime: ConversationRuntime, options?: { touchUpdatedAt?: boolean }) => {
      try {
        const messages = await window.harness.getMessages({ sessionKey: runtime.sessionKey });
        const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
        if (state) applySessionState(runtime, state);
        const runtimeTitle = runtime.title.trim() || "New conversation";
        const derivedTitle = deriveTitleFromMessages(messages, runtimeTitle);
        const hasCustomTitle = runtimeTitle !== "New conversation" && runtimeTitle !== derivedTitle;
        const title = hasCustomTitle ? runtimeTitle : derivedTitle;
        await persistConversation({
          projectCwd: runtime.cwd,
          sessionId: runtime.conversationId,
          sessionFile: state?.sessionFile ?? runtime.sessionFile,
          messages,
          clientId: runtime.conversationId,
          title,
          touchUpdatedAt: options?.touchUpdatedAt,
        });
        runtime.title = title;
        bumpRuntimes();
      } catch {
        // Pi may not be running for this session yet.
      }
    },
    [applySessionState, bumpRuntimes],
  );

  const requestTitleGeneration = useCallback(
    (runtime: ConversationRuntime) => {
      const conversationId = runtime.conversationId;
      if (titleGenerationRef.current.has(conversationId)) return;
      if (titleGeneratedSetRef.current.has(conversationId)) return;

      // Find the first user message
      const firstUser = runtime.timeline.items.find((item) => item.kind === "user");
      if (!firstUser?.content?.trim()) return;
      // Don't generate if there are more than 1 user messages (conversation is already named)
      const userCount = runtime.timeline.items.filter((item) => item.kind === "user").length;
      if (userCount > 1) return;
      const firstUserFallbackTitle = deriveTitleFromMessages(
        [{ role: "user", content: firstUser.content }],
        "New conversation",
      );
      const hasCustomTitle =
        runtime.title !== "New conversation" && runtime.title !== firstUserFallbackTitle;
      if (hasCustomTitle) {
        titleGeneratedSetRef.current.add(conversationId);
        return;
      }

      const promise = (async () => {
        try {
          const result = await window.harness.generateTitle({
            message: firstUser.content,
          });
          if (result.title) {
            titleGeneratedSetRef.current.add(conversationId);
            const current = runtimesRef.current.get(conversationId);
            if (current) {
              current.title = result.title;
              bumpRuntimes();
            }
            await updateConversationTitle(conversationId, result.title);
            setConversationRefreshKey((k) => k + 1);
          }
        } catch (err) {
          console.error("[requestTitleGeneration]", err);
        } finally {
          titleGenerationRef.current.delete(conversationId);
        }
      })();

      titleGenerationRef.current.set(conversationId, promise);
    },
    [bumpRuntimes],
  );

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

  const syncActiveStreamingFromBackend = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime || runtime.status !== "connected") return;

    try {
      const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
      const shouldStream =
        state?.isStreaming === true || runtimeIsStreaming(runtime);
      if (runtime.isStreaming !== shouldStream) {
        runtime.isStreaming = shouldStream;
        bumpRuntimes();
      }
    } catch {
      // Session may be unavailable while reconnecting.
    }
  }, [bumpRuntimes]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void syncActiveStreamingFromBackend();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncActiveStreamingFromBackend]);

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
      setCanSendMessages(settings.canSendMessages);
      setChatVisibleModels(settings.chatVisibleModels);
    } catch {
      setCanSendMessages(undefined);
      setChatVisibleModels([]);
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

      reconcileRuntimeSessionKey(runtime, sessionKey);
      runtime.timeline = applyHarnessEvent(runtime.timeline, event);
      const e = event as {
        type?: string;
        toolName?: string;
        args?: unknown;
        assistantMessageEvent?: { type?: string };
      };
      if (e.type === "agent_start") runtime.isStreaming = true;
      if (
        e.type === "tool_execution_start" ||
        (e.type === "message_update" && e.assistantMessageEvent?.type !== "error")
      ) {
        runtime.isStreaming = true;
      }
      if (e.type === "agent_end" || e.type === "harness_exit") {
        runtime.isStreaming = false;
        if (e.type === "harness_exit") {
          runtime.status = "disconnected";
        }
        runtime.timeline = finalizeTimeline(runtime.timeline);
      }
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "error") {
        runtime.isStreaming = false;
        const errPayload = e.assistantMessageEvent as { error?: { errorMessage?: string } };
        const message = errPayload.error?.errorMessage?.trim();
        if (message) {
          runtime.error = message;
        }
      }
      if (e.type === "tool_execution_start" && e.toolName) {
        const pending = parsePendingQuestionFromTool(e.toolName, e.args);
        if (pending) {
          if (pending.source === "prompt" && e.toolName.trim().toLowerCase() === "ask_question") {
            pending.source = "extension-ui";
          }
          runtime.pendingQuestion = pending;
        }
      }
      const uiSnapshot = parseExtensionUiSelectSnapshot(event);
      if (uiSnapshot) {
        const current = runtime.pendingQuestion;
        if (current?.source === "extension-ui" && current.questions.length > 0) {
          const matchedIndex = current.questions.findIndex(
            (question) => question.prompt === uiSnapshot.prompt,
          );
          const nextIndex = matchedIndex >= 0 ? matchedIndex : current.currentQuestionIndex;
          const questions = current.questions.map((question, index) =>
            index === nextIndex
              ? { ...question, options: uiSnapshot.options }
              : question,
          );
          runtime.pendingQuestion = {
            ...current,
            currentQuestionIndex: nextIndex,
            questions,
            requestId: uiSnapshot.requestId,
          };
        } else {
          runtime.pendingQuestion = {
            title: "Questions",
            currentQuestionIndex: 0,
            source: "extension-ui",
            requestId: uiSnapshot.requestId,
            questions: [
              {
                id: "question-1",
                prompt: uiSnapshot.prompt,
                allowMultiple: false,
                options: uiSnapshot.options,
                selectedOptionIds: [],
              },
            ],
          };
        }
      }
      if (e.type === "harness_exit") {
        runtime.pendingQuestion = null;
      }

      if (
        e.type === "tool_execution_end" &&
        e.toolName &&
        (e.toolName.toLowerCase() === "edit" || e.toolName.toLowerCase() === "write")
      ) {
        setGitStatsRefreshKey((k) => k + 1);
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
          void syncRuntimeToStorage(runtime, { touchUpdatedAt: false });
          void refreshProjects({ silent: true });
          requestTitleGeneration(runtime);
        }
      }
    });

    return () => {
      if (contextRefreshTimeoutRef.current) {
        clearTimeout(contextRefreshTimeoutRef.current);
      }
      unsubscribe();
    };
  }, [bumpRuntimes, refreshProjects, syncRuntimeToStorage, requestTitleGeneration]);

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

  const handleArchiveAllChats = useCallback(
    async (projectCwd: string) => {
      const archivedIds = await archiveAllConversationsForProject(projectCwd);
      const archivedIdSet = new Set(archivedIds);

      for (const id of archivedIds) {
        runtimesRef.current.delete(id);
      }

      if (
        activeConversationIdRef.current &&
        archivedIdSet.has(activeConversationIdRef.current)
      ) {
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
      }

      bumpRuntimes();
      setConversationRefreshKey((k) => k + 1);
      void refreshProjects({ silent: true });
    },
    [bumpRuntimes, refreshProjects],
  );

  const handleRemoveProject = useCallback(
    async (projectCwd: string) => {
      const activeRuntime = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;

      await removeProjectFromStorage(projectCwd);

      for (const [id, runtime] of runtimesRef.current) {
        if (runtime.cwd === projectCwd) {
          runtimesRef.current.delete(id);
        }
      }

      if (activeRuntime?.cwd === projectCwd) {
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
      }

      setExpandedProjectCwds((prev) => {
        if (!prev.has(projectCwd)) return prev;
        const next = new Set(prev);
        next.delete(projectCwd);
        return next;
      });

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
    runtime.timeline = finalizeTimeline(runtime.timeline);
  };

  const handleSendMessage = useCallback(
    async (text: string, images?: DraftImageContent[]) => {
      const runtime = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      const hasImages = Boolean(images?.length);
      if ((!text && !hasImages) || !runtime || runtime.status !== "connected") return;

      const steer = runtimeIsStreaming(runtime);
      if (!steer && sendInFlightRef.current) return;
      if (!steer) sendInFlightRef.current = true;

      revokeDraftPreviewUrls(draft);
      const empty = createEmptyDraft();
      setDraft(empty);
      runtime.composerDraft = empty;
      runtime.pendingQuestion = null;
      const userImages = images?.map((image) => ({
        mimeType: image.mimeType,
        data: image.data,
      }));
      runtime.timeline = appendThinking({
        items: [
          ...runtime.timeline.items,
          {
            kind: "user",
            id: nextId("user"),
            content: text,
            ...(userImages?.length ? { images: userImages } : {}),
          },
        ],
      });
      runtime.isStreaming = true;
      runtime.error = null;
      bumpRuntimes();

      try {
        const settings = await window.harness.getSettings();
        setCanSendMessages(settings.canSendMessages);
        if (!settings.canSendMessages) {
          runtime.isStreaming = false;
          clearThinking(runtime);
          bumpRuntimes();
          return;
        }

        if (swarmToggleInFlightRef.current) {
          await swarmToggleInFlightRef.current;
        }
        const swarmSync = await window.harness.setSwarmMode({
          sessionKey: runtime.sessionKey,
          enabled: runtime.swarmMode ?? false,
        });
        if (!swarmSync.success) {
          runtime.error = swarmSync.error ?? "Failed to sync Swarm mode before sending";
          runtime.isStreaming = false;
          clearThinking(runtime);
          bumpRuntimes();
          return;
        }

        const response = await window.harness.prompt({
          sessionKey: runtime.sessionKey,
          message: text,
          ...(userImages?.length ? { images: userImages.map((image) => ({ type: "image" as const, ...image })) } : {}),
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
            // Prompt RPC returns after preflight; do not clear streaming from a stale getState.
            if (state.isStreaming) runtime.isStreaming = true;
          }
          bumpRuntimes();
          void syncRuntimeToStorage(runtime, { touchUpdatedAt: true });
        }
      } catch (err) {
        runtime.error = err instanceof Error ? err.message : String(err);
        runtime.isStreaming = false;
        clearThinking(runtime);
        bumpRuntimes();
      } finally {
        if (!steer) sendInFlightRef.current = false;
      }
    },
    [applySessionState, bumpRuntimes, draft, syncRuntimeToStorage],
  );

  const handleSend = async () => {
    const text = serializeDraft(draft);
    const images = extractImagesFromDraft(draft);
    await handleSendMessage(text, images.length > 0 ? images : undefined);
  };

  const handleQuestionPickOption = useCallback(
    (optionId: string) => {
      const conversationId = activeConversationIdRef.current;
      if (!conversationId) return;
      const runtime = runtimesRef.current.get(conversationId);
      if (!runtime?.pendingQuestion) return;
      const { currentQuestionIndex } = runtime.pendingQuestion;
      runtime.pendingQuestion = withQuestionSelection(
        runtime.pendingQuestion,
        currentQuestionIndex,
        optionId,
      );
      bumpRuntimes();
    },
    [bumpRuntimes],
  );

  const handleQuestionPrevious = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime?.pendingQuestion) return;
    runtime.pendingQuestion = withQuestionIndex(
      runtime.pendingQuestion,
      runtime.pendingQuestion.currentQuestionIndex - 1,
    );
    bumpRuntimes();
  }, [bumpRuntimes]);

  const handleQuestionSkip = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime?.pendingQuestion) return;
    const pending = runtime.pendingQuestion;
    const question = pending.questions[pending.currentQuestionIndex];
    if (!question) return;
    if (pending.source === "extension-ui" && pending.requestId) {
      void window.harness.respondExtensionUi({
        sessionKey: runtime.sessionKey,
        id: pending.requestId,
        cancelled: true,
      });
      runtime.pendingQuestion = null;
      bumpRuntimes();
      return;
    }
    runtime.pendingQuestion = {
      ...pending,
      questions: pending.questions.map((item, index) =>
        index === pending.currentQuestionIndex
          ? { ...item, selectedOptionIds: [] }
          : item,
      ),
    };
    const isLast = pending.currentQuestionIndex >= pending.questions.length - 1;
    if (isLast) {
      const response = buildPendingQuestionResponse(runtime.pendingQuestion);
      void handleSendMessage(response);
      return;
    }
    runtime.pendingQuestion = withQuestionIndex(
      runtime.pendingQuestion,
      pending.currentQuestionIndex + 1,
    );
    bumpRuntimes();
  }, [bumpRuntimes, handleSendMessage]);

  const handleQuestionNext = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime?.pendingQuestion) return;
    const pending = runtime.pendingQuestion;
    if (pending.source === "extension-ui" && pending.requestId) {
      const active = pending.questions[pending.currentQuestionIndex];
      if (!active) return;
      const selected = active.options.find((option) =>
        active.selectedOptionIds.includes(option.id),
      );
      if (!selected) return;
      void window.harness.respondExtensionUi({
        sessionKey: runtime.sessionKey,
        id: pending.requestId,
        value: selected.label,
      });
      const isLast = pending.currentQuestionIndex >= pending.questions.length - 1;
      runtime.pendingQuestion = isLast
        ? null
        : {
            ...pending,
            requestId: undefined,
            currentQuestionIndex: Math.min(
              pending.currentQuestionIndex + 1,
              pending.questions.length - 1,
            ),
          };
      bumpRuntimes();
      return;
    }
    const isLast = pending.currentQuestionIndex >= pending.questions.length - 1;
    if (isLast) {
      const response = buildPendingQuestionResponse(pending);
      void handleSendMessage(response);
      return;
    }
    runtime.pendingQuestion = withQuestionIndex(
      pending,
      pending.currentQuestionIndex + 1,
    );
    bumpRuntimes();
  }, [bumpRuntimes, handleSendMessage]);

  const handleSessionStateSynced = useCallback(
    (_sessionKey: string, state: HarnessState | null): void => {
      const conversationId = activeConversationIdRef.current;
      if (!conversationId || !state) return;
      const runtime = runtimesRef.current.get(conversationId);
      if (!runtime) return;
      const prevKey = runtime.sessionKey;
      const prevSwarmMode = runtime.swarmMode;
      applySessionState(runtime, state);
      if (runtime.sessionKey !== prevKey || runtime.swarmMode !== prevSwarmMode) bumpRuntimes();
    },
    [applySessionState, bumpRuntimes],
  );

  const handleToggleSwarmMode = useCallback(async () => {
    if (swarmToggleInFlightRef.current) {
      await swarmToggleInFlightRef.current;
    }
    const toggleTask = (async () => {
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (!runtime || runtime.status !== "connected") return;
    const nextEnabled = !runtime.swarmMode;
    runtime.swarmMode = nextEnabled;
    bumpRuntimes();
    try {
      const response = await window.harness.setSwarmMode({
        sessionKey: runtime.sessionKey,
        enabled: nextEnabled,
      });
      if (!response.success) {
        runtime.swarmMode = !nextEnabled;
        runtime.error = response.error ?? "Failed to toggle Swarm mode";
      } else {
        const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
        if (state) applySessionState(runtime, state);
      }
    } catch (err) {
      runtime.swarmMode = !nextEnabled;
      runtime.error = err instanceof Error ? err.message : String(err);
    }
    bumpRuntimes();
    })();
    swarmToggleInFlightRef.current = toggleTask;
    try {
      await toggleTask;
    } finally {
      if (swarmToggleInFlightRef.current === toggleTask) {
        swarmToggleInFlightRef.current = null;
      }
    }
  }, [applySessionState, bumpRuntimes]);

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
      runtime.pendingQuestion = null;
      runtime.timeline = finalizeTimeline(runtime.timeline);
      bumpRuntimes();
    } catch (err) {
      runtime.error = err instanceof Error ? err.message : String(err);
      bumpRuntimes();
    }
  };

  const handleSettingsChanged = useCallback(() => {
    piSessionsRestartedRef.current = true;
    setCreditsRefreshKey((key) => key + 1);
    void refreshProjects({ silent: true });
    void refreshAuthStatus();
  }, [refreshAuthStatus, refreshProjects]);

  const handleOpenSettings = useCallback((section: SettingsSection = "general") => {
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

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

  useHarnessMenuActions({
    onOpenSettings: handleOpenSettings,
    onOpenFolder: handleOpenFolder,
    onNewConversation: handleNewConversation,
    onToggleSidebar: toggleSidebar,
    onToggleSwarm: handleToggleSwarmMode,
    getNewConversationCwd: () => cwd ?? projects[0]?.cwd ?? null,
  });

  const mainContent = settingsOpen ? (
    <SettingsView
      onClose={handleSettingsClose}
      onSettingsChanged={handleSettingsChanged}
      activeSessionKey={activeSessionKey}
      initialSection={settingsInitialSection}
    />
  ) : (
    <div
      className={`flex h-screen min-h-0 flex-col text-slate-900 dark:text-neutral-200 ${
        electronMacVibrancy ? "bg-transparent" : "bg-slate-50 dark:bg-[#151515]"
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
          onArchiveAllChats={handleArchiveAllChats}
          onRemoveProject={handleRemoveProject}
          onOpenFolder={handleOpenFolder}
          onOpenSettings={handleOpenSettings}
          creditsRefreshKey={creditsRefreshKey}
          tokensRefreshKey={contextRefreshKey}
          onNewConversationForProject={handleNewConversation}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-[#151515]">
          <ChatWorkspaceHeader
            title={chatTitle}
            isMac={isMac}
            showSidebarToggle={!sidebarOpen && showMainSidebarToggle}
            onToggleSidebar={toggleSidebar}
            cwd={cwd}
            filePaths={editedFilePaths}
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
                      {renderTimelineRows(
                        prepareTimelineForDisplay(timeline.items, isStreaming),
                        isStreaming,
                      )}
                      <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden="true" />
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
                      onOpenSettings={() => handleOpenSettings("cloud-providers")}
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
                visibleModelRefs={chatVisibleModels}
                onModelChange={() => setContextRefreshKey((k) => k + 1)}
                onAddModels={() => handleOpenSettings("chat")}
                onSessionStateSynced={handleSessionStateSynced}
                swarmMode={swarmMode}
                onToggleSwarmMode={() => void handleToggleSwarmMode()}
                pendingQuestion={pendingQuestion}
                onQuestionPickOption={handleQuestionPickOption}
                onQuestionPrevious={handleQuestionPrevious}
                onQuestionSkip={handleQuestionSkip}
                onQuestionNext={handleQuestionNext}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      <NewModelsNotice />
    </>
  );
}

function renderTimelineRows(items: TimelineItem[], isStreaming: boolean) {
  const rows: ReactNode[] = [];
  let exploreBatch: ToolLineItem[] = [];
  let reasoningBatch: ReasoningItem[] = [];
  let fileEditBatch: ToolLineItem[] = [];

  const flushFileEditBatch = () => {
    if (fileEditBatch.length === 0) return;

    if (isStreaming) {
      for (const line of fileEditBatch) {
        if (line.active) {
          rows.push(<ToolLine key={line.id} line={line} isStreaming={isStreaming} />);
        }
      }
    } else {
      const completed = fileEditBatch.filter((line) => !line.active);
      if (completed.length > 0) {
        rows.push(
          <FileEditsSummary key={`file-edits-${completed[0]!.id}`} lines={completed} />,
        );
      }
    }
    fileEditBatch = [];
  };

  const flushExploreBatch = () => {
    if (exploreBatch.length === 0) return;
    if (exploreBatch.length <= VISIBLE_EXPLORE_COUNT) {
      for (const line of exploreBatch) {
        rows.push(<ToolLine key={line.id} line={line} isStreaming={isStreaming} />);
      }
    } else {
      rows.push(
        <ToolExploreGroup
          key={`explore-${exploreBatch[0]!.id}`}
          lines={exploreBatch}
          isStreaming={isStreaming}
        />,
      );
    }
    exploreBatch = [];
  };

  const flushReasoningBatch = () => {
    for (const item of reasoningBatch) {
      rows.push(
        <ReasoningBlock key={item.id} item={item} isStreaming={isStreaming} />,
      );
    }
    reasoningBatch = [];
  };

  const flushTurnActivity = () => {
    flushExploreBatch();
    flushReasoningBatch();
  };

  for (const item of items) {
    if (item.kind === "user") {
      flushFileEditBatch();
      flushTurnActivity();
      rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
      continue;
    }

    if (item.kind === "assistant") {
      flushTurnActivity();
      rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
      flushFileEditBatch();
      continue;
    }

    if (item.kind === "tool-line" && item.operation === "read") {
      exploreBatch.push(item);
      continue;
    }

    flushExploreBatch();

    if (item.kind === "tool-line" && (item.operation === "edit" || item.operation === "write")) {
      if (isStreaming && item.active) {
        rows.push(<ToolLine key={item.id} line={item} isStreaming={isStreaming} />);
      } else {
        fileEditBatch.push(item);
      }
      continue;
    }

    if (item.kind === "tool-line") {
      rows.push(<ToolLine key={item.id} line={item} isStreaming={isStreaming} />);
      continue;
    }
    if (item.kind === "tool-activity") {
      rows.push(
        <ToolActivity key={item.id} activity={item} isStreaming={isStreaming} />,
      );
      continue;
    }
    if (item.kind === "reasoning") {
      reasoningBatch.push(item);
      continue;
    }
    rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
  }

  flushFileEditBatch();
  flushTurnActivity();
  return rows;
}

function TimelineRow({
  item,
  isStreaming,
}: {
  item: TimelineItem;
  isStreaming: boolean;
}) {
  if (item.kind === "thinking") {
    return isStreaming ? <Thinking /> : null;
  }

  if (item.kind === "reasoning") {
    return <ReasoningBlock item={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "tool-line") {
    return <ToolLine line={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "tool-activity") {
    return <ToolActivity activity={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "user") {
    return (
      <div className="message message-user">
        <div className="message-content">
          <UserMessageContent content={item.content} images={item.images} />
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
