import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatNotice } from "./components/ChatNotice";
import { Composer } from "./components/Composer";
import { ChatLanding } from "./components/main-workspace/ChatLanding";
import { ChatWorkspaceHeader } from "./components/main-workspace/ChatWorkspaceHeader";
import { RightWorkspacePanel } from "./components/main-workspace/RightWorkspacePanel";
import type { RightPanelTab } from "./components/main-workspace/RightPanelTabs";
import { GithubConnectDialog } from "./components/github/GithubConnectDialog";
import { MainWorkspaceSidebar } from "./components/sidenav/MainWorkspaceSidebar";
import { WorkModeSidebar } from "./components/sidenav/WorkModeSidebar";
import { SettingsView } from "./components/settings/SettingsView";
import type { SettingsSection } from "./components/settings/SettingsNav";
import { WORKFLOW_RUN_REQUESTED_EVENT } from "./components/settings/workflows/WorkflowEditorView";
import {
  WorkflowsWorkspaceView,
  type WorkflowsWorkspaceTab,
} from "./components/workflows/WorkflowsWorkspaceView";
import { countActiveWorkflowRuns } from "./components/workflows/WorkflowRunStatusBadge";
import { renderTimelineRows } from "./components/timeline/TimelineRows";
import type { SelectionActionPayload } from "./lib/selection-action-types";
import {
  cloneDraft,
  createEmptyDraft,
  extractImagesFromDraft,
  extractToolsFromDraft,
  revokeDraftPreviewUrls,
  serializeDraft,
  type ComposerSegment,
  type DraftImageContent,
} from "./lib/composer-draft";
import {
  attachedRootsChanged,
  rootsForMissingMentionPaths,
} from "./lib/attached-roots-sync";
import {
  electronMacVibrancy,
  isMacUA,
  mainSidebarToggleDelayMs,
} from "./components/main-workspace/constants";
import {
  deriveTitleFromMessages,
  getStoredMessages,
  getWorkWorkspacePath,
  isWorkWorkspaceCwd,
  listConversationsFromStorage,
  listProjectsFromStorage,
  listWorkProjectsFromStorage,
  persistConversation,
  persistAttachedRoots,
  persistWorkbookTabs,
  rememberProject,
  rememberWorkProject,
  removeConversationFromStorage,
  archiveAllConversationsForProject,
  removeProjectFromStorage,
  updateConversationTitle,
} from "./lib/chat-storage";
import { getConversationById, getWorkSidebarProjects } from "./lib/chat-db";
import {
  collectStreamingConversationIds,
  bumpWorkbookRefresh,
  closeWorkbookTabOnRuntime,
  createConversationRuntime,
  extractSheetFromXlsxToolArgs,
  findConversationIdBySessionKey,
  getActiveOfficePath,
  getActiveWorkbookPath,
  getActiveWorkbookSheet,
  officeFileKindFromPath,
  openOfficeTabOnRuntime,
  reconcileRuntimeSessionKey,
  runtimeHasPlanDocument,
  runtimeIsStreaming,
  setActiveWorkbookSheetOnRuntime,
  setActiveWorkbookTab,
  type ConnectionStatus,
  type ConversationRuntime,
} from "./lib/conversation-runtime";
import { dedupeAttachedRoots } from "../../shared/attached-roots";
import type { StoredAttachedRoot } from "./lib/chat-db";
import { messagesToTimeline } from "./lib/messages-to-timeline";
import { wrapSilentUserMessage } from "./lib/silent-user-message";
import { tryAutoConnectSourceControl } from "./lib/auto-connect-source-control";
import {
  readLastUsedProject,
  writeLastUsedProject,
  type LandingSession,
  type LandingTarget,
} from "./lib/last-used-project";
import { useHarnessMenuActions } from "./hooks/useHarnessMenuActions";
import { useAuthUser } from "./hooks/useAuthUser";
import {
  clampRightPanelWidth,
  DEFAULT_RIGHT_PANEL_WIDTH,
  MIN_RIGHT_PANEL_WIDTH,
} from "./hooks/useRightPanelResize";
import { useGithubConnectedByPath, useGithubConnection } from "./hooks/useGithubConnection";
import { useThreadScroll } from "./hooks/useThreadScroll";
import { getActiveChatNotice } from "./lib/harness-error-display";
import { buildSessionKey } from "./lib/session-key";
import { persistWorkflowRun } from "./lib/workflow-run-storage";
import { parseWorkflowRunSessionKey } from "./lib/workflow-run-session";
import {
  buildPendingQuestionResponse,
  parseExtensionUiSelectSnapshot,
  parsePendingQuestionFromTool,
  withQuestionIndex,
  withQuestionSelection,
} from "./lib/pending-question";
import { extractRawFilePathFromArgs } from "./lib/tool-activity-summary";
import { NewModelsNotice } from "./components/NewModelsNotice";
import type { AppWorkMode, ConversationSummary, HarnessState, ProjectSummary } from "../../preload/api";
import { useWorkflowRunsQuery } from "./queries/use-workflows";
import {
  useConnectGithubRepoMutation,
  useDisconnectGithubRepoMutation,
} from "./queries/use-github";
import { useQueryClient } from "./providers/QueryProvider";
import { remoteKeys } from "./queries/query-keys";
import {
  appendThinking,
  applyHarnessEvent,
  createInitialTimelineState,
  finalizeTimeline,
  nextId,
  prepareTimelineForDisplay,
} from "./events";

export function App() {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuthUser();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [runtimesVersion, setRuntimesVersion] = useState(0);
  const [draft, setDraft] = useState<ComposerSegment[]>(createEmptyDraft);
  const [streamingConversationIds, setStreamingConversationIds] = useState(
    () => new Set<string>(),
  );
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [workProjectsRefreshKey, setWorkProjectsRefreshKey] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjectCwds, setExpandedProjectCwds] = useState(() => new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMainSidebarToggle, setShowMainSidebarToggle] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const [rightPanelMinWidth, setRightPanelMinWidth] = useState(MIN_RIGHT_PANEL_WIDTH);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("files");
  const [rightPanelOfficeView, setRightPanelOfficeView] = useState(false);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [implementingPlan, setImplementingPlan] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSection>("general");
  const [canSendMessages, setCanSendMessages] = useState<boolean | undefined>(undefined);
  const [chatVisibleModels, setChatVisibleModels] = useState<string[]>([]);
  const [gitStatsRefreshKey, setGitStatsRefreshKey] = useState(0);
  const [workMode, setWorkMode] = useState<AppWorkMode>("coding");
  const [activeView, setActiveView] = useState<"chat" | "workflows">("chat");
  const [workflowsTab, setWorkflowsTab] = useState<WorkflowsWorkspaceTab>("definitions");
  const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState<string | null>(null);
  const [pendingManualRunId, setPendingManualRunId] = useState<string | null>(null);
  const [landingTarget, setLandingTarget] = useState<LandingTarget | null>(null);
  const [landingPlanMode, setLandingPlanMode] = useState(false);
  const [landingSession, setLandingSession] = useState<LandingSession | null>(null);

  const runtimesRef = useRef(new Map<string, ConversationRuntime>());
  const workModeRef = useRef<AppWorkMode>("coding");
  const activeConversationIdRef = useRef<string | null>(null);
  const viewGenerationRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const projectsHydratedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const chatWorkspaceRef = useRef<HTMLDivElement>(null);
  const contextRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const piSessionsRestartedRef = useRef(false);
  const swarmToggleInFlightRef = useRef<Promise<void> | null>(null);
  const planToggleInFlightRef = useRef<Promise<void> | null>(null);
  const sendInFlightRef = useRef(false);
  const titleGenerationRef = useRef(new Map<string, Promise<void>>());
  const titleGeneratedSetRef = useRef(new Set<string>());
  const landingInitializedRef = useRef(false);
  const landingSessionRef = useRef<LandingSession | null>(null);

  const workflowRunsQuery = useWorkflowRunsQuery({ limit: 100 });
  const activeWorkflowRunCount = countActiveWorkflowRuns(workflowRunsQuery.data?.runs ?? []);

  const bumpRuntimes = useCallback(() => {
    setRuntimesVersion((v) => v + 1);
    setStreamingConversationIds(collectStreamingConversationIds(runtimesRef.current));
  }, []);

  const activeRuntime = useMemo(
    () =>
      activeConversationId
        ? runtimesRef.current.get(activeConversationId)
        : undefined,
    [activeConversationId, runtimesVersion],
  );

  const cwd = activeRuntime?.cwd ?? null;
  const effectiveProjectCwd = cwd ?? landingTarget?.cwd ?? null;
  const [githubConnectOpen, setGithubConnectOpen] = useState(false);
  const [githubConnectTarget, setGithubConnectTarget] = useState<string | null>(null);
  const projectPaths = useMemo(() => projects.map((project) => project.cwd), [projects]);
  const githubConnectedByPath = useGithubConnectedByPath(projectPaths);
  const connectGithubRepo = useConnectGithubRepoMutation();
  const disconnectGithubRepo = useDisconnectGithubRepoMutation();
  const {
    connection: githubConnection,
    agentReady: githubAgentReady,
  } = useGithubConnection(cwd);
  const selectedSessionFile = activeRuntime?.sessionFile ?? null;
  const selectedConversationId = activeRuntime?.conversationId ?? null;
  const timeline = activeRuntime?.timeline ?? createInitialTimelineState();
  const isLandingLayout = timeline.items.length === 0;
  const composerHasMessages = timeline.items.length > 0;
  const status = activeRuntime?.status ?? ("disconnected" as ConnectionStatus);
  const error = activeRuntime?.error ?? null;
  const chatNotice = getActiveChatNotice({
    projectOpen: effectiveProjectCwd !== null,
    canSendMessages,
    runtimeError: error,
  });
  const isStreaming = activeRuntime ? runtimeIsStreaming(activeRuntime) : false;
  const chatTitle = activeRuntime?.title ?? "OpenHarness";
  const activeSessionKey = activeRuntime?.sessionKey ?? null;
  const composerSessionKey =
    activeSessionKey ??
    (landingSession?.status === "connected" ? landingSession.sessionKey : null);
  const composerProjectReady =
    (activeRuntime != null && status === "connected") ||
    (isLandingLayout && activeRuntime == null && landingSession?.status === "connected");
  const composerSessionPending =
    effectiveProjectCwd != null &&
    !composerProjectReady &&
    (activeRuntime != null
      ? status !== "connected"
      : landingSession?.status === "connecting" ||
        (landingTarget != null && landingSession == null));
  const swarmMode = activeRuntime?.swarmMode ?? false;
  const planMode = activeRuntime?.planMode ?? false;
  const planPhase = activeRuntime?.planPhase ?? null;
  const showPlanTab = runtimeHasPlanDocument(activeRuntime);
  const workbookTabs = activeRuntime?.workbookTabs;
  const activeWorkbookPath = activeRuntime ? getActiveOfficePath(activeRuntime) : undefined;
  const activeWorkbookSheet = activeRuntime
    ? getActiveWorkbookSheet(activeRuntime, activeWorkbookPath)
    : undefined;
  const workbookRefreshKey = activeRuntime?.workbookRefreshKey ?? 0;
  const attachedRoots = activeRuntime?.attachedRoots ?? [];
  const pendingQuestion = activeRuntime?.pendingQuestion ?? null;
  const isMac = isMacUA && typeof window.harness !== "undefined";
  const isEverydayWorkMode = workMode === "everyday";

  useEffect(() => {
    workModeRef.current = workMode;
  }, [workMode]);

  useEffect(() => {
    landingInitializedRef.current = false;
    setLandingTarget(null);
    setLandingPlanMode(false);
  }, [workMode]);

  useEffect(() => {
    if (!activeRuntime || timeline.items.length > 0) return;
    const context =
      activeRuntime.context ?? (isEverydayWorkMode ? ("work" as const) : ("coding" as const));
    setLandingTarget({ cwd: activeRuntime.cwd, context });
  }, [
    activeRuntime?.cwd,
    activeRuntime?.context,
    isEverydayWorkMode,
    timeline.items.length,
  ]);

  useEffect(() => {
    if (projectsLoading) return;
    if (landingInitializedRef.current) return;
    if (activeConversationId) {
      landingInitializedRef.current = true;
      return;
    }

    void (async () => {
      const stored = readLastUsedProject();
      let initial: LandingTarget | null = null;

      if (stored && stored.workMode === workMode) {
        if (stored.context === "work" && workMode === "everyday") {
          const workPath = await getWorkWorkspacePath();
          initial = { cwd: workPath, context: "work" };
        } else if (stored.context === "work-project" && workMode === "everyday") {
          const workProjects = await listWorkProjectsFromStorage();
          if (workProjects.some((project) => project.cwd === stored.cwd)) {
            initial = { cwd: stored.cwd, context: "work-project" };
          }
        } else if (stored.context === "coding" && workMode === "coding") {
          if (projects.some((project) => project.cwd === stored.cwd)) {
            initial = { cwd: stored.cwd, context: "coding" };
          }
        }
      }

      if (!initial) {
        if (workMode === "everyday") {
          const workPath = await getWorkWorkspacePath();
          initial = { cwd: workPath, context: "work" };
        } else if (projects[0]) {
          initial = { cwd: projects[0].cwd, context: "coding" };
        }
      }

      if (initial) {
        setLandingTarget(initial);
      }
      landingInitializedRef.current = true;
    })();
  }, [activeConversationId, projects, projectsLoading, workMode]);

  useEffect(() => {
    landingSessionRef.current = landingSession;
  }, [landingSession]);

  useEffect(() => {
    if (!isLandingLayout || activeRuntime || !landingTarget) {
      setLandingSession(null);
      landingSessionRef.current = null;
      return;
    }

    const clientId = crypto.randomUUID();
    const draftSessionKey = buildSessionKey(landingTarget.cwd, { conversationId: clientId });
    const connecting: LandingSession = {
      clientId,
      sessionKey: draftSessionKey,
      cwd: landingTarget.cwd,
      context: landingTarget.context,
      status: "connecting",
    };
    setLandingSession(connecting);
    landingSessionRef.current = connecting;

    let cancelled = false;
    void (async () => {
      try {
        const { sessionKey: ensuredKey } = await window.harness.start({
          cwd: landingTarget.cwd,
          conversationId: clientId,
          conversationContext: landingTarget.context,
        });
        if (cancelled) return;

        const response = await window.harness.newSession({ sessionKey: ensuredKey });
        if (!response.success) {
          throw new Error(response.error ?? "Could not start a new conversation");
        }
        if (cancelled) return;

        void window.harness.setActiveSession({ sessionKey: ensuredKey });
        const connected: LandingSession = {
          clientId,
          sessionKey: ensuredKey,
          cwd: landingTarget.cwd,
          context: landingTarget.context,
          status: "connected",
        };
        landingSessionRef.current = connected;
        setLandingSession(connected);
        setContextRefreshKey((key) => key + 1);
      } catch (err) {
        if (cancelled) return;
        const failed: LandingSession = {
          ...connecting,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
        landingSessionRef.current = failed;
        setLandingSession(failed);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRuntime, isLandingLayout, landingTarget]);

  useEffect(() => {
    const unsubscribe = window.harness.onWorkbookChanged((payload) => {
      // Markdown tabs reload via onOfficeFileChanged with content comparison.
      if (officeFileKindFromPath(payload.relativePath) === "md") return;

      for (const runtime of runtimesRef.current.values()) {
        const openPaths = runtime.workbookTabs?.openPaths ?? [];
        if (runtime.cwd !== payload.cwd || !openPaths.includes(payload.relativePath)) {
          continue;
        }
        if (getActiveWorkbookPath(runtime) !== payload.relativePath) {
          continue;
        }
        bumpWorkbookRefresh(runtime);
        bumpRuntimes();
      }
    });
    return unsubscribe;
  }, [bumpRuntimes]);

  useEffect(() => {
    const runtime = activeConversationId
      ? runtimesRef.current.get(activeConversationId)
      : undefined;
    const hasTabs = (runtime?.workbookTabs?.openPaths.length ?? 0) > 0;
    if (workMode === "everyday") {
      setRightPanelOpen(hasTabs);
      if (hasTabs) {
        setRightPanelOfficeView(true);
      }
    }
  }, [activeConversationId, workMode]);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const toggleRightPanel = useCallback(() => setRightPanelOpen((open) => !open), []);

  const handleWorkbookTabSelect = useCallback(
    (relativePath: string) => {
      if (!activeConversationId) return;
      const runtime = runtimesRef.current.get(activeConversationId);
      if (!runtime || !setActiveWorkbookTab(runtime, relativePath)) return;
      setRightPanelOfficeView(true);
      setRightPanelOpen(true);
      bumpRuntimes();
      void persistWorkbookTabs(runtime);
    },
    [activeConversationId, bumpRuntimes],
  );

  const handleRightPanelTabChange = useCallback((tab: RightPanelTab) => {
    setRightPanelTab(tab);
    setRightPanelOfficeView(false);
  }, []);

  const handleWorkbookTabClose = useCallback(
    (relativePath: string) => {
      if (!activeConversationId) return;
      const runtime = runtimesRef.current.get(activeConversationId);
      if (!runtime || !closeWorkbookTabOnRuntime(runtime, relativePath)) return;
      bumpRuntimes();
      void persistWorkbookTabs(runtime);
      if (!runtime.workbookTabs?.openPaths.length) {
        setRightPanelOpen(false);
        setRightPanelOfficeView(false);
      }
    },
    [activeConversationId, bumpRuntimes],
  );

  const handleWorkbookManualRefresh = useCallback(() => {
    if (!activeConversationId) return;
    const runtime = runtimesRef.current.get(activeConversationId);
    if (!runtime) return;
    bumpWorkbookRefresh(runtime);
    bumpRuntimes();
  }, [activeConversationId, bumpRuntimes]);

  const handleWorkbookSheetChange = useCallback(
    (sheetName: string) => {
      if (!activeConversationId || !activeWorkbookPath) return;
      const runtime = runtimesRef.current.get(activeConversationId);
      if (!runtime || !setActiveWorkbookSheetOnRuntime(runtime, activeWorkbookPath, sheetName)) {
        return;
      }
      bumpRuntimes();
      void persistWorkbookTabs(runtime);
    },
    [activeConversationId, activeWorkbookPath, bumpRuntimes],
  );

  const maybeOpenExternalOfficeFile = useCallback(
    (absolutePath: string) => {
      const lower = absolutePath.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".docx") && !lower.endsWith(".md")) return;

      const conversationId =
        activeConversationIdRef.current ?? landingSessionRef.current?.clientId;
      const runtime = conversationId ? runtimesRef.current.get(conversationId) : undefined;
      if (!runtime) return;

      if (openOfficeTabOnRuntime(runtime, absolutePath)) {
        setRightPanelOpen(true);
        setRightPanelOfficeView(true);
        void persistWorkbookTabs(runtime);
        bumpRuntimes();
      }
    },
    [bumpRuntimes],
  );

  const handleAttachExternalRoots = useCallback(
    async (newRoots: StoredAttachedRoot[]) => {
      if (newRoots.length === 0) return;

      const conversationId =
        activeConversationIdRef.current ?? landingSessionRef.current?.clientId;
      const runtime = conversationId ? runtimesRef.current.get(conversationId) : undefined;
      const sessionKey = runtime?.sessionKey ?? landingSessionRef.current?.sessionKey;
      if (!conversationId || !sessionKey) return;

      const merged = dedupeAttachedRoots([...(runtime?.attachedRoots ?? []), ...newRoots]);
      if (runtime) {
        runtime.attachedRoots = merged;
      }
      await window.harness.setAttachedRoots({ sessionKey, roots: merged });
      if (runtime) {
        void persistAttachedRoots(runtime);
      }

      for (const root of newRoots) {
        if (root.kind === "file") {
          maybeOpenExternalOfficeFile(root.absolutePath);
        }
      }

      if (runtime) {
        bumpRuntimes();
      }
    },
    [bumpRuntimes, maybeOpenExternalOfficeFile],
  );

  const syncAttachedRootsFromDraft = useCallback(
    async (runtime: ConversationRuntime, segments: ComposerSegment[]) => {
      const merged = await rootsForMissingMentionPaths({
        segments,
        attachedRoots: runtime.attachedRoots ?? [],
        attachedRootsFromPaths: (paths) => window.harness.attachedRootsFromPaths(paths),
      });
      if (!attachedRootsChanged(runtime.attachedRoots ?? [], merged)) {
        return;
      }

      runtime.attachedRoots = merged;
      await window.harness.setAttachedRoots({ sessionKey: runtime.sessionKey, roots: merged });
      void persistAttachedRoots(runtime);
      bumpRuntimes();
    },
    [bumpRuntimes],
  );

  const handleRemoveAttachedRoot = useCallback(
    async (rootId: string) => {
      if (!activeConversationId) return;
      const runtime = runtimesRef.current.get(activeConversationId);
      if (!runtime?.attachedRoots?.length) return;

      const nextRoots = runtime.attachedRoots.filter((root) => root.id !== rootId);
      runtime.attachedRoots = nextRoots.length > 0 ? nextRoots : undefined;
      await window.harness.setAttachedRoots({
        sessionKey: runtime.sessionKey,
        roots: nextRoots,
      });
      void persistAttachedRoots(runtime);
      bumpRuntimes();
    },
    [activeConversationId, bumpRuntimes],
  );

  useEffect(() => {
    if (!rightPanelOpen) return;

    const reclampPanelWidth = () => {
      const container = chatWorkspaceRef.current;
      if (!container) return;
      setRightPanelWidth((current) =>
        clampRightPanelWidth(current, container.getBoundingClientRect().width, rightPanelMinWidth),
      );
    };

    reclampPanelWidth();
    window.addEventListener("resize", reclampPanelWidth);
    return () => window.removeEventListener("resize", reclampPanelWidth);
  }, [rightPanelOpen, rightPanelMinWidth]);

  useEffect(() => {
    const conversationId = activeConversationId;
    const runtime = conversationId ? runtimesRef.current.get(conversationId) : undefined;
    if (!runtime?.cwd || !conversationId) return;

    let cancelled = false;
    void (async () => {
      const result = await window.harness.getPlanFile({
        cwd: runtime.cwd,
        conversationId,
      });
      if (cancelled) return;
      if (result.ok && result.contents.trim()) {
        if (runtime.planPhase !== "implementing") {
          runtime.planPhase = "ready";
        }
        runtime.planPath = result.relativePath;
        bumpRuntimes();
        setPlanRefreshKey((k) => k + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, bumpRuntimes]);

  useEffect(() => {
    if (!showPlanTab && rightPanelTab === "plan") {
      setRightPanelTab("files");
    }
  }, [showPlanTab, rightPanelTab]);

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
    (
      runtime: ConversationRuntime,
      state: {
        sessionFile?: string;
        swarmMode?: boolean;
        planMode?: boolean;
      },
    ) => {
      if (typeof state.swarmMode === "boolean") {
        runtime.swarmMode = state.swarmMode;
      }
      if (typeof state.planMode === "boolean") {
        runtime.planMode = state.planMode;
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
          context: runtime.context,
          workbookTabs: runtime.workbookTabs,
          attachedRoots: runtime.attachedRoots,
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
      const stored = await listProjectsFromStorage();
      const fromHarness = await window.harness.listProjects();
      const workProjectCwds = new Set(
        (await getWorkSidebarProjects()).map((project) => project.cwd),
      );
      const byCwd = new Map(stored.map((p) => [p.cwd, p] as const));

      for (const project of fromHarness) {
        if (workProjectCwds.has(project.cwd)) continue;
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

      const merged = [...byCwd.values()]
        .filter((project) => !isWorkWorkspaceCwd(project.cwd))
        .sort((a, b) => {
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

  const { chatScrollRef, handleChatScroll, stickActiveToBottom } = useThreadScroll({
    activeConversationId,
    activeConversationIdRef,
    timelineItems: timeline.items,
    isStreaming,
    messagesEndRef,
  });

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
      setWorkMode(settings.workMode);
    } catch {
      setCanSendMessages(undefined);
      setChatVisibleModels([]);
    }
  }, []);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  useEffect(() => {
    const onRunRequested = (event: Event) => {
      const detail = (event as CustomEvent<{ runId: string }>).detail;
      if (!detail.runId) return;
      setSettingsOpen(false);
      setActiveView("workflows");
      setWorkflowsTab("runs");
      setSelectedWorkflowRunId(detail.runId);
      setPendingManualRunId(detail.runId);
    };
    window.addEventListener(WORKFLOW_RUN_REQUESTED_EVENT, onRunRequested);
    return () => {
      window.removeEventListener(WORKFLOW_RUN_REQUESTED_EVENT, onRunRequested);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.harness.onWorkflowRunUpdate((payload) => {
      void persistWorkflowRun({
        runId: payload.runId,
        workflowId: payload.workflowId,
        title: payload.title,
        messages: payload.messages,
        streaming: payload.streaming,
        touchUpdatedAt: !payload.streaming,
      });
      if (!payload.streaming) {
        void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowRuns"] });
      }
    });
    void window.harness.syncWorkflowRuns().then((result) => {
      if (result.reconciled > 0) {
        void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowRuns"] });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    if (activeView !== "workflows") return;
    void window.harness.syncWorkflowRuns().then((result) => {
      if (result.reconciled > 0) {
        void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowRuns"] });
        void workflowRunsQuery.refetch();
      }
    });
  }, [activeView, queryClient, workflowRunsQuery]);

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
      if (parseWorkflowRunSessionKey(sessionKey)) return;

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
      if (e.type === "tool_execution_end" && e.toolName?.toLowerCase() === "write_plan") {
        runtime.planPhase = "ready";
        runtime.planPath = `.openharness/plans/${runtime.conversationId}.md`;
        setPlanRefreshKey((k) => k + 1);
        setRightPanelOpen(true);
        setRightPanelTab("plan");
        setRightPanelOfficeView(false);
      }
      if (e.type === "tool_execution_end") {
        const toolName = e.toolName?.toLowerCase();
        const isOfficeTool =
          toolName === "read_xlsx" ||
          toolName === "edit_xlsx" ||
          toolName === "read_docx" ||
          toolName === "edit_docx";
        const isMarkdownTool =
          toolName === "read" || toolName === "edit" || toolName === "write";
        if (isOfficeTool || isMarkdownTool) {
          const path = extractRawFilePathFromArgs(e.args);
          const opensMarkdown = Boolean(path?.toLowerCase().endsWith(".md"));
          const shouldOpenTab = isOfficeTool || (isMarkdownTool && opensMarkdown);
          if (
            path &&
            shouldOpenTab &&
            openOfficeTabOnRuntime(runtime, path)
          ) {
            setRightPanelOpen(true);
            setRightPanelOfficeView(true);
            if (toolName === "read_xlsx" || toolName === "edit_xlsx") {
              const sheetName = extractSheetFromXlsxToolArgs(toolName, e.args);
              if (sheetName) {
                setActiveWorkbookSheetOnRuntime(runtime, path, sheetName);
              }
            }
            void persistWorkbookTabs(runtime);
          }
        }
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

  const clearActiveConversation = useCallback(() => {
    viewGenerationRef.current += 1;
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setDraft(createEmptyDraft());
    setRightPanelTab("files");
    setRightPanelOfficeView(false);
  }, []);

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
          conversationContext: runtime.context,
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
      options?: {
        sessionFile?: string;
        sessionId?: string;
        title?: string;
        context?: "coding" | "work" | "work-project";
        initialMessages?: unknown[];
        streaming?: boolean;
      },
    ) => {
      const viewId = ++viewGenerationRef.current;
      const conversationId = options?.sessionId ?? crypto.randomUUID();
      const sessionFile = options?.sessionFile || undefined;
      const storedConversation = await getConversationById(conversationId);
      if (storedConversation?.source === "github-workflow") return;

      const conversationContext = options?.context ?? storedConversation?.context;

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

      const messages =
        options?.initialMessages?.length
          ? options.initialMessages
          : (cachedMessages ?? []);
      const initialTimeline = messages.length
        ? messagesToTimeline(messages)
        : createInitialTimelineState();
      const title =
        options?.title ?? deriveTitleFromMessages(messages, "New conversation");

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
        context: conversationContext,
        workbookTabs: storedConversation?.workbookTabs,
        attachedRoots: storedConversation?.attachedRoots,
      });
      runtimesRef.current.set(conversationId, runtime);
      attachRuntime(conversationId);

      if (conversationContext !== "work") {
        setExpandedProjectCwds((prev) => {
          if (prev.has(projectCwd)) return prev;
          const next = new Set(prev);
          next.add(projectCwd);
          return next;
        });
      }

      try {
        const { sessionKey: ensuredKey, messages: piMessages } = await window.harness.start({
          cwd: projectCwd,
          sessionFile,
          conversationId,
          conversationContext,
          attachedRoots: runtime.attachedRoots,
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
        if (conversationContext === "work-project") {
          void rememberWorkProject(projectCwd);
        } else if (conversationContext !== "work") {
          void rememberProject(projectCwd);
        }
        await persistConversation({
          projectCwd,
          sessionId: conversationId,
          sessionFile: runtime.sessionFile,
          messages,
          clientId: conversationId,
          context: conversationContext,
          workbookTabs: runtime.workbookTabs,
          touchUpdatedAt: false,
        });
        setConversationRefreshKey((k) => k + 1);
        void refreshProjects({ silent: true });
      } catch (err) {
        if (viewId !== viewGenerationRef.current) return;
        runtime.status = "error";
        runtime.error = err instanceof Error ? err.message : String(err);
        bumpRuntimes();
      }
    },
    [applySessionState, attachRuntime, bumpRuntimes, reconnectRuntime, refreshProjects],
  );

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    void (async () => {
      const settings = await window.harness.getSettings();
      setWorkMode(settings.workMode);
      if (settings.workMode === "everyday") return;
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
    setActiveView("chat");
    void refreshAuthStatus();
    void tryAutoConnectSourceControl(result.cwd, { authenticated: Boolean(authUser) }).then(
      (connected) => {
        if (!connected) return;
        void queryClient.invalidateQueries({
          queryKey: remoteKeys.github.connection(result.cwd),
        });
        void queryClient.invalidateQueries({ queryKey: remoteKeys.github.status() });
      },
    );
    const clientId = crypto.randomUUID();
    await loadConversation(result.cwd, { sessionId: clientId, title: "New conversation" });
  }, [authUser, loadConversation, queryClient, refreshAuthStatus]);

  const handleLandingSelectTarget = useCallback(
    (target: LandingTarget) => {
      setLandingTarget(target);
      writeLastUsedProject({
        cwd: target.cwd,
        context: target.context,
        workMode,
      });
    },
    [workMode],
  );

  const handleLandingOpenFolder = useCallback(async () => {
    const result = await window.harness.pickDirectory();
    if (result.canceled) return;
    setActiveView("chat");
    void refreshAuthStatus();
    void tryAutoConnectSourceControl(result.cwd, { authenticated: Boolean(authUser) }).then(
      (connected) => {
        if (!connected) return;
        void queryClient.invalidateQueries({
          queryKey: remoteKeys.github.connection(result.cwd),
        });
        void queryClient.invalidateQueries({ queryKey: remoteKeys.github.status() });
      },
    );
    const now = new Date().toISOString();
    await rememberProject(result.cwd, now);
    void refreshProjects({ silent: true });
    const target: LandingTarget = { cwd: result.cwd, context: "coding" };
    setLandingTarget(target);
    writeLastUsedProject({ cwd: result.cwd, context: "coding", workMode: "coding" });
  }, [authUser, queryClient, refreshAuthStatus, refreshProjects]);

  const handleLandingOpenWorkProject = useCallback(async () => {
    const result = await window.harness.pickDirectory({ skipOpenHarness: true });
    if (result.canceled) return;
    const now = new Date().toISOString();
    await rememberWorkProject(result.cwd, now);
    setWorkProjectsRefreshKey((key) => key + 1);
    const target: LandingTarget = { cwd: result.cwd, context: "work-project" };
    setLandingTarget(target);
    writeLastUsedProject({ cwd: result.cwd, context: "work-project", workMode: "everyday" });
  }, []);

  const handleSelectConversation = useCallback(
    async (projectCwd: string, conversation: ConversationSummary) => {
      if (conversation.source === "github-workflow") return;
      setActiveView("chat");
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
      setWorkProjectsRefreshKey((k) => k + 1);
      void refreshProjects({ silent: true });
    },
    [bumpRuntimes, refreshProjects],
  );

  const handleNewConversation = useCallback(
    async (projectCwd: string, context?: "coding" | "work" | "work-project") => {
      setActiveView("chat");
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
        context,
      });
      runtimesRef.current.set(clientId, runtime);
      attachRuntime(clientId);

      try {
        const { sessionKey: ensuredKey } = await window.harness.start({
          cwd: projectCwd,
          conversationId: clientId,
          conversationContext: context,
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
          context,
        });
        if (context !== "work") {
          setExpandedProjectCwds((prev) => {
            const next = new Set(prev);
            next.add(projectCwd);
            return next;
          });
        }
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

  const attachLandingSessionAsRuntime = useCallback(async (): Promise<ConversationRuntime | null> => {
    const session = landingSessionRef.current;
    if (!session || session.status !== "connected") return null;

    setActiveView("chat");
    const runtime = createConversationRuntime({
      conversationId: session.clientId,
      sessionKey: session.sessionKey,
      cwd: session.cwd,
      title: "New conversation",
      status: "connected",
      context: session.context,
    });
    runtimesRef.current.set(session.clientId, runtime);
    attachRuntime(session.clientId);

    await persistConversation({
      projectCwd: session.cwd,
      clientId: session.clientId,
      messages: [],
      sessionFile: null,
      context: session.context,
    });

    if (session.context !== "work") {
      setExpandedProjectCwds((prev) => {
        const next = new Set(prev);
        next.add(session.cwd);
        return next;
      });
    }
    setConversationRefreshKey((key) => key + 1);
    void refreshProjects({ silent: true });
    bumpRuntimes();

    landingSessionRef.current = null;
    setLandingSession(null);

    return runtime;
  }, [attachRuntime, bumpRuntimes, refreshProjects]);

  const handleNewWorkConversation = useCallback(async () => {
    const workCwd = await getWorkWorkspacePath();
    await handleNewConversation(workCwd, "work");
  }, [handleNewConversation]);

  const handleNewWorkProject = useCallback(async () => {
    const result = await window.harness.pickDirectory({ skipOpenHarness: true });
    if (result.canceled) return;
    await handleNewConversation(result.cwd, "work-project");
    setWorkProjectsRefreshKey((k) => k + 1);
  }, [handleNewConversation]);

  const handleSelectWorkProjectConversation = useCallback(
    async (projectCwd: string, conversation: ConversationSummary) => {
      const active = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      const sameSession =
        conversation.sessionFile && active?.sessionFile === conversation.sessionFile;
      const sameDraft =
        !conversation.sessionFile && active?.conversationId === conversation.sessionId;
      if (projectCwd === active?.cwd && (sameSession || sameDraft)) return;

      await loadConversation(projectCwd, {
        sessionFile: conversation.sessionFile || undefined,
        sessionId: conversation.sessionId,
        title: conversation.title,
        context: "work-project",
      });
    },
    [loadConversation],
  );

  const handleSelectWorkConversation = useCallback(
    async (conversation: ConversationSummary) => {
      const workCwd = await getWorkWorkspacePath();
      const active = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      const sameSession =
        conversation.sessionFile && active?.sessionFile === conversation.sessionFile;
      const sameDraft =
        !conversation.sessionFile && active?.conversationId === conversation.sessionId;
      if (workCwd === active?.cwd && (sameSession || sameDraft)) return;

      await loadConversation(workCwd, {
        sessionFile: conversation.sessionFile || undefined,
        sessionId: conversation.sessionId,
        title: conversation.title,
        context: "work",
      });
    },
    [loadConversation],
  );

  const handleArchiveWorkConversation = useCallback(
    async (conversation: ConversationSummary) => {
      await handleArchiveConversation("", conversation);
    },
    [handleArchiveConversation],
  );

  const toggleProjectExpanded = useCallback((projectCwd: string) => {
    setActiveView("chat");
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
    async (
      text: string,
      images?: DraftImageContent[],
      tools?: ReturnType<typeof extractToolsFromDraft>,
      sendOptions?: { silent?: boolean; draftSegments?: ComposerSegment[] },
    ) => {
      const runtime = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      const hasImages = Boolean(images?.length);
      if ((!text && !hasImages) || !runtime || runtime.status !== "connected") return;

      const silent = sendOptions?.silent === true;
      const promptMessage = silent ? wrapSilentUserMessage(text) : text;

      const steer = runtimeIsStreaming(runtime);
      if (!steer && sendInFlightRef.current) return;
      if (!steer) sendInFlightRef.current = true;

      const draftSegments = sendOptions?.draftSegments ?? draft;
      try {
        await syncAttachedRootsFromDraft(runtime, draftSegments);
      } catch (err) {
        console.error("[composer] failed to sync attached roots before send:", err);
      }

      revokeDraftPreviewUrls(draftSegments);
      const empty = createEmptyDraft();
      setDraft(empty);
      runtime.composerDraft = empty;
      runtime.pendingQuestion = null;
      const userImages = images?.map((image) => ({
        mimeType: image.mimeType,
        data: image.data,
      }));
      runtime.timeline = appendThinking({
        items: silent
          ? runtime.timeline.items
          : [
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
      stickActiveToBottom();

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
        if (planToggleInFlightRef.current) {
          await planToggleInFlightRef.current;
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

        const planSync = await window.harness.setPlanMode({
          sessionKey: runtime.sessionKey,
          enabled: runtime.planMode ?? false,
          conversationId: runtime.conversationId,
        });
        if (!planSync.success) {
          runtime.error = planSync.error ?? "Failed to sync Plan mode before sending";
          runtime.isStreaming = false;
          clearThinking(runtime);
          bumpRuntimes();
          return;
        }

        const response = await window.harness.prompt({
          sessionKey: runtime.sessionKey,
          message: promptMessage,
          ...(userImages?.length ? { images: userImages.map((image) => ({ type: "image" as const, ...image })) } : {}),
          ...(tools?.length ? { tools } : {}),
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
    [applySessionState, bumpRuntimes, draft, stickActiveToBottom, syncAttachedRootsFromDraft, syncRuntimeToStorage],
  );

  const ensureThreadForProject = useCallback(
    async (projectCwd: string): Promise<ConversationRuntime | null> => {
      const activeId = activeConversationIdRef.current;
      const active = activeId ? runtimesRef.current.get(activeId) : undefined;
      if (active?.cwd === projectCwd && active.status === "connected") {
        return active;
      }
      await handleNewConversation(projectCwd);
      const nextId = activeConversationIdRef.current;
      return nextId ? (runtimesRef.current.get(nextId) ?? null) : null;
    },
    [handleNewConversation],
  );

  const handleSelectionAction = useCallback(
    async ({ cwd: projectCwd, message }: SelectionActionPayload) => {
      const runtime = await ensureThreadForProject(projectCwd);
      if (!runtime || runtime.status !== "connected") return;
      await handleSendMessage(message);
    },
    [ensureThreadForProject, handleSendMessage],
  );

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
      const prevPlanMode = runtime.planMode;
      applySessionState(runtime, state);
      if (
        runtime.sessionKey !== prevKey ||
        runtime.swarmMode !== prevSwarmMode ||
        runtime.planMode !== prevPlanMode
      ) {
        bumpRuntimes();
      }
    },
    [applySessionState, bumpRuntimes],
  );

  const exitPlanMode = useCallback(
    async (runtime: ConversationRuntime, options?: { preservePlan?: boolean }) => {
      const preservePlan = options?.preservePlan ?? false;
      runtime.planMode = false;
      if (!preservePlan) {
        runtime.planPhase = null;
        runtime.planPath = undefined;
        try {
          await window.harness.deletePlanFile({
            cwd: runtime.cwd,
            conversationId: runtime.conversationId,
          });
          setPlanRefreshKey((k) => k + 1);
        } catch (err) {
          runtime.error = err instanceof Error ? err.message : String(err);
        }
      }
      bumpRuntimes();
      try {
        const response = await window.harness.setPlanMode({
          sessionKey: runtime.sessionKey,
          enabled: false,
        });
        if (!response.success) {
          runtime.error = response.error ?? "Failed to exit Plan mode";
        } else {
          const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
          if (state) applySessionState(runtime, state);
        }
      } catch (err) {
        runtime.error = err instanceof Error ? err.message : String(err);
      }
      bumpRuntimes();
    },
    [applySessionState, bumpRuntimes],
  );

  const abortPlanMode = useCallback(
    async (runtime: ConversationRuntime) => {
      await exitPlanMode(runtime, { preservePlan: false });
    },
    [exitPlanMode],
  );

  const enablePlanMode = useCallback(
    async (runtime: ConversationRuntime) => {
      runtime.planMode = true;
      runtime.swarmMode = false;

      let hasReadyPlan =
        runtime.planPhase === "ready" || runtime.planPhase === "implementing";
      if (!hasReadyPlan) {
        try {
          const existing = await window.harness.getPlanFile({
            cwd: runtime.cwd,
            conversationId: runtime.conversationId,
          });
          if (existing.ok && existing.contents.trim()) {
            hasReadyPlan = true;
            runtime.planPhase = "ready";
            runtime.planPath = existing.relativePath;
          }
        } catch {
          // Fall through to a fresh interview.
        }
      }

      if (hasReadyPlan) {
        bumpRuntimes();
      } else {
        runtime.planPhase = "interview";
        bumpRuntimes();
        try {
          await window.harness.deletePlanFile({
            cwd: runtime.cwd,
            conversationId: runtime.conversationId,
          });
          setPlanRefreshKey((k) => k + 1);
        } catch (err) {
          runtime.error = err instanceof Error ? err.message : String(err);
        }
      }

      try {
        const swarmOff = await window.harness.setSwarmMode({
          sessionKey: runtime.sessionKey,
          enabled: false,
        });
        if (!swarmOff.success) {
          runtime.error = swarmOff.error ?? "Failed to disable Swarm mode";
          runtime.planMode = false;
          if (!hasReadyPlan) runtime.planPhase = null;
          bumpRuntimes();
          return;
        }
        const response = await window.harness.setPlanMode({
          sessionKey: runtime.sessionKey,
          enabled: true,
          conversationId: runtime.conversationId,
        });
        if (!response.success) {
          runtime.planMode = false;
          if (!hasReadyPlan) runtime.planPhase = null;
          runtime.error = response.error ?? "Failed to enable Plan mode";
        } else {
          const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
          if (state) applySessionState(runtime, state);
        }
      } catch (err) {
        runtime.planMode = false;
        if (!hasReadyPlan) runtime.planPhase = null;
        runtime.error = err instanceof Error ? err.message : String(err);
      }
      bumpRuntimes();
    },
    [applySessionState, bumpRuntimes],
  );

  const handleToggleLandingPlan = useCallback(() => {
    if (isEverydayWorkMode) return;
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (runtime?.status === "connected") {
      setLandingPlanMode(false);
      if (runtime.planMode) {
        void abortPlanMode(runtime);
      } else {
        void enablePlanMode(runtime);
      }
      return;
    }
    setLandingPlanMode((value) => !value);
  }, [abortPlanMode, enablePlanMode, isEverydayWorkMode]);

  const handleSend = async () => {
    const text = serializeDraft(draft);
    const images = extractImagesFromDraft(draft);
    const tools = extractToolsFromDraft(draft);

    let runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;

    if (!runtime && landingTarget) {
      let session = landingSessionRef.current;
      if (session?.status === "connecting") {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          session = landingSessionRef.current;
          if (session?.status === "connected" || session?.status === "error") break;
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
      }

      if (session?.status === "connected") {
        runtime = (await attachLandingSessionAsRuntime()) ?? undefined;
      } else {
        await handleNewConversation(landingTarget.cwd, landingTarget.context);
        const nextId = activeConversationIdRef.current;
        runtime = nextId ? runtimesRef.current.get(nextId) : undefined;
      }

      if (!runtime || runtime.status !== "connected") return;

      writeLastUsedProject({
        cwd: landingTarget.cwd,
        context: landingTarget.context,
        workMode,
      });

      if (landingPlanMode && workMode === "coding") {
        await enablePlanMode(runtime);
      }
      setLandingPlanMode(false);
    }

    await handleSendMessage(
      text,
      images.length > 0 ? images : undefined,
      tools.length > 0 ? tools : undefined,
      { draftSegments: draft },
    );
  };

  const handleAbortPlanMode = useCallback(async () => {
    if (workModeRef.current === "everyday") return;
    if (planToggleInFlightRef.current) {
      await planToggleInFlightRef.current;
    }
    const toggleTask = (async () => {
      const runtime = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      if (!runtime || runtime.status !== "connected") return;
      await abortPlanMode(runtime);
    })();
    planToggleInFlightRef.current = toggleTask;
    try {
      await toggleTask;
    } finally {
      if (planToggleInFlightRef.current === toggleTask) {
        planToggleInFlightRef.current = null;
      }
    }
  }, [abortPlanMode]);

  const handleCycleComposerMode = useCallback(async () => {
    if (isEverydayWorkMode) return;
    if (planToggleInFlightRef.current) {
      await planToggleInFlightRef.current;
    }
    if (swarmToggleInFlightRef.current) {
      await swarmToggleInFlightRef.current;
    }
    const toggleTask = (async () => {
      const runtime = activeConversationIdRef.current
        ? runtimesRef.current.get(activeConversationIdRef.current)
        : undefined;
      if (!runtime || runtime.status !== "connected") return;

      const currentMode = runtime.planMode ? "plan" : runtime.swarmMode ? "swarm" : "normal";
      const nextMode =
        currentMode === "normal" ? "plan" : currentMode === "plan" ? "swarm" : "normal";

      if (currentMode === "plan") {
        await exitPlanMode(runtime, {
          preservePlan:
            runtime.planPhase === "ready" || runtime.planPhase === "implementing",
        });
      }

      if (nextMode === "plan") {
        await enablePlanMode(runtime);
        return;
      }

      runtime.planMode = false;
      if (nextMode === "swarm") {
        runtime.swarmMode = true;
      } else {
        runtime.swarmMode = false;
      }
      bumpRuntimes();

      try {
        await window.harness.setPlanMode({
          sessionKey: runtime.sessionKey,
          enabled: false,
        });
        const swarmResponse = await window.harness.setSwarmMode({
          sessionKey: runtime.sessionKey,
          enabled: runtime.swarmMode,
        });
        if (!swarmResponse.success) {
          runtime.error = swarmResponse.error ?? "Failed to update composer mode";
        } else {
          const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
          if (state) applySessionState(runtime, state);
        }
      } catch (err) {
        runtime.error = err instanceof Error ? err.message : String(err);
      }
      bumpRuntimes();
    })();
    planToggleInFlightRef.current = toggleTask;
    try {
      await toggleTask;
    } finally {
      if (planToggleInFlightRef.current === toggleTask) {
        planToggleInFlightRef.current = null;
      }
    }
  }, [applySessionState, bumpRuntimes, enablePlanMode, exitPlanMode, isEverydayWorkMode]);

  const handleLandingAbortPlanMode = useCallback(() => {
    if (isEverydayWorkMode) return;
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (runtime?.status === "connected") {
      void abortPlanMode(runtime);
      return;
    }
    setLandingPlanMode(false);
  }, [abortPlanMode, isEverydayWorkMode]);

  const handleLandingCycleComposerMode = useCallback(() => {
    if (isEverydayWorkMode) return;
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (runtime?.status === "connected") {
      void handleCycleComposerMode();
      return;
    }
    handleToggleLandingPlan();
  }, [handleCycleComposerMode, handleToggleLandingPlan, isEverydayWorkMode]);

  const handleImplementPlan = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const runtime = runtimesRef.current.get(conversationId);
    if (!runtime || runtime.status !== "connected") return;

    setImplementingPlan(true);
    try {
      const result = await window.harness.getPlanFile({
        cwd: runtime.cwd,
        conversationId: runtime.conversationId,
      });
      if (!result.ok || !result.contents.trim()) return;

      const planContents = result.contents;
      runtime.planMode = false;
      runtime.planPhase = "implementing";
      bumpRuntimes();

      await window.harness.setPlanMode({
        sessionKey: runtime.sessionKey,
        enabled: false,
      });

      await handleSendMessage(
        `Implement the following plan:\n\n${planContents}`,
        undefined,
        undefined,
        { silent: true },
      );
    } catch (err) {
      runtime.error = err instanceof Error ? err.message : String(err);
      bumpRuntimes();
    } finally {
      setImplementingPlan(false);
    }
  }, [bumpRuntimes, handleSendMessage]);

  const handleToggleSwarmMode = useCallback(async () => {
    if (workModeRef.current === "everyday") return;
    if (swarmToggleInFlightRef.current) {
      await swarmToggleInFlightRef.current;
    }
    const toggleTask = (async () => {
    const runtime = activeConversationIdRef.current
      ? runtimesRef.current.get(activeConversationIdRef.current)
      : undefined;
    if (!runtime || runtime.status !== "connected") return;
    const nextEnabled = !runtime.swarmMode;
    if (nextEnabled && runtime.planMode) {
      await exitPlanMode(runtime, {
        preservePlan:
          runtime.planPhase === "ready" || runtime.planPhase === "implementing",
      });
    }
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
  }, [applySessionState, bumpRuntimes, exitPlanMode]);

  const handleSetComposerMode = useCallback(
    async (target: "plan" | "swarm") => {
      if (isEverydayWorkMode) return;
      if (planToggleInFlightRef.current) {
        await planToggleInFlightRef.current;
      }
      if (swarmToggleInFlightRef.current) {
        await swarmToggleInFlightRef.current;
      }

      const toggleTask = (async () => {
        const runtime = activeConversationIdRef.current
          ? runtimesRef.current.get(activeConversationIdRef.current)
          : undefined;

        if (!runtime || runtime.status !== "connected") {
          if (target === "swarm") return;
          setLandingPlanMode((active) => !active);
          return;
        }

        const currentMode = runtime.planMode ? "plan" : runtime.swarmMode ? "swarm" : "normal";

        if (currentMode === target) {
          if (target === "plan") {
            await abortPlanMode(runtime);
          } else if (runtime.swarmMode) {
            runtime.swarmMode = false;
            bumpRuntimes();
            try {
              const response = await window.harness.setSwarmMode({
                sessionKey: runtime.sessionKey,
                enabled: false,
              });
              if (!response.success) {
                runtime.swarmMode = true;
                runtime.error = response.error ?? "Failed to disable Swarm mode";
              } else {
                const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
                if (state) applySessionState(runtime, state);
              }
            } catch (err) {
              runtime.swarmMode = true;
              runtime.error = err instanceof Error ? err.message : String(err);
            }
            bumpRuntimes();
          }
          return;
        }

        if (target === "plan") {
          if (runtime.swarmMode) {
            runtime.swarmMode = false;
            bumpRuntimes();
            try {
              await window.harness.setSwarmMode({
                sessionKey: runtime.sessionKey,
                enabled: false,
              });
            } catch (err) {
              runtime.error = err instanceof Error ? err.message : String(err);
            }
          }
          await enablePlanMode(runtime);
          return;
        }

        if (runtime.planMode) {
          await exitPlanMode(runtime, {
            preservePlan:
              runtime.planPhase === "ready" || runtime.planPhase === "implementing",
          });
        }
        runtime.swarmMode = true;
        bumpRuntimes();
        try {
          await window.harness.setPlanMode({
            sessionKey: runtime.sessionKey,
            enabled: false,
          });
          const response = await window.harness.setSwarmMode({
            sessionKey: runtime.sessionKey,
            enabled: true,
          });
          if (!response.success) {
            runtime.swarmMode = false;
            runtime.error = response.error ?? "Failed to enable Swarm mode";
          } else {
            const state = await window.harness.getState({ sessionKey: runtime.sessionKey });
            if (state) applySessionState(runtime, state);
          }
        } catch (err) {
          runtime.swarmMode = false;
          runtime.error = err instanceof Error ? err.message : String(err);
        }
        bumpRuntimes();
      })();

      planToggleInFlightRef.current = toggleTask;
      try {
        await toggleTask;
      } finally {
        if (planToggleInFlightRef.current === toggleTask) {
          planToggleInFlightRef.current = null;
        }
      }
    },
    [
      abortPlanMode,
      applySessionState,
      bumpRuntimes,
      enablePlanMode,
      exitPlanMode,
      isEverydayWorkMode,
    ],
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
    void queryClient.invalidateQueries({ queryKey: remoteKeys.credits() });
    void refreshProjects({ silent: true });
    void refreshAuthStatus();
  }, [queryClient, refreshAuthStatus, refreshProjects]);

  const handleWorkModeChange = useCallback(
    (mode: AppWorkMode) => {
      setWorkMode(mode);
      clearActiveConversation();
    },
    [clearActiveConversation],
  );

  const handleOpenSettings = useCallback((section: SettingsSection = "general") => {
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

  const handleOpenWorkflows = useCallback(() => {
    setActiveView("workflows");
  }, []);

  const handleWorkflowRunTriggered = useCallback((runId: string) => {
    setActiveView("workflows");
    setWorkflowsTab("runs");
    setSelectedWorkflowRunId(runId);
    setPendingManualRunId(runId);
  }, []);

  const handleOpenGithubConnect = useCallback((projectPath: string) => {
    setGithubConnectTarget(projectPath);
    setGithubConnectOpen(true);
  }, []);

  const handleDisconnectGithub = useCallback(
    async (projectPath: string) => {
      await disconnectGithubRepo.mutateAsync(projectPath);
    },
    [disconnectGithubRepo],
  );

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

  const workSidebarSelectedProjectCwd =
    activeRuntime?.context === "work-project" ? cwd : null;

  useHarnessMenuActions({
    onOpenSettings: handleOpenSettings,
    onOpenFolder: () => {
      if (workModeRef.current === "everyday") {
        void handleNewWorkConversation();
        return;
      }
      void handleOpenFolder();
    },
    onNewConversation: (projectCwd) => {
      if (workModeRef.current === "everyday") {
        void handleNewWorkConversation();
        return;
      }
      void handleNewConversation(projectCwd);
    },
    onToggleSidebar: toggleSidebar,
    onToggleSwarm: handleToggleSwarmMode,
    getNewConversationCwd: () => {
      if (workModeRef.current === "everyday") return "__work__";
      return cwd ?? projects[0]?.cwd ?? null;
    },
  });

  const mainContent = settingsOpen ? (
    <SettingsView
      onClose={handleSettingsClose}
      onSettingsChanged={handleSettingsChanged}
      onWorkModeChange={handleWorkModeChange}
      activeSessionKey={activeSessionKey}
      initialSection={settingsInitialSection}
    />
  ) : (
    <div
      className={`flex h-screen min-h-0 flex-col text-slate-900 dark:text-neutral-200 ${
        electronMacVibrancy ? "bg-transparent" : "bg-[var(--settings-page-bg)] dark:bg-[#151515]"
      }`}
    >
      <div className="flex min-h-0 flex-1">
        {isEverydayWorkMode ? (
          <WorkModeSidebar
            sidebarRef={sidebarRef}
            sidebarOpen={sidebarOpen}
            isMac={isMac}
            onToggleSidebar={toggleSidebar}
            selectedProjectCwd={workSidebarSelectedProjectCwd}
            selectedSessionFile={selectedSessionFile}
            selectedConversationId={selectedConversationId}
            conversationRefreshKey={conversationRefreshKey}
            workProjectsRefreshKey={workProjectsRefreshKey}
            streamingConversationIds={streamingConversationIds}
            expandedProjectCwds={expandedProjectCwds}
            onToggleProjectExpanded={toggleProjectExpanded}
            onSelectChat={handleSelectWorkConversation}
            onSelectProjectConversation={handleSelectWorkProjectConversation}
            onArchiveChat={handleArchiveWorkConversation}
            onArchiveProjectConversation={handleArchiveConversation}
            onArchiveAllChats={handleArchiveAllChats}
            onRemoveProject={handleRemoveProject}
            onNewChat={() => void handleNewWorkConversation()}
            onNewProject={() => void handleNewWorkProject()}
            onNewConversationForProject={(projectCwd) =>
              void handleNewConversation(projectCwd, "work-project")
            }
            onOpenSettings={handleOpenSettings}
            tokensRefreshKey={contextRefreshKey}
          />
        ) : (
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
            tokensRefreshKey={contextRefreshKey}
            onNewConversationForProject={handleNewConversation}
            githubConnectedByPath={githubConnectedByPath}
            onConnectGithub={handleOpenGithubConnect}
            onDisconnectGithub={(projectPath) => void handleDisconnectGithub(projectPath)}
            workflowsActive={activeView === "workflows"}
            activeWorkflowRunCount={activeWorkflowRunCount}
            onOpenWorkflows={handleOpenWorkflows}
          />
        )}

        <main
          ref={chatWorkspaceRef}
          className={`relative flex min-h-0 min-w-0 flex-1 ${
            activeView === "workflows" && !isEverydayWorkMode
              ? electronMacVibrancy
                ? "bg-transparent"
                : "bg-[var(--settings-page-bg)]"
              : "bg-[var(--settings-page-bg)] dark:bg-[#151515]"
          }`}
        >
          {activeView === "workflows" && !isEverydayWorkMode ? (
            <WorkflowsWorkspaceView
              workspaceTab={workflowsTab}
              onWorkspaceTabChange={setWorkflowsTab}
              selectedRunId={selectedWorkflowRunId}
              onSelectedRunIdChange={(runId) => {
                setSelectedWorkflowRunId(runId);
                if (!runId) setPendingManualRunId(null);
              }}
              pendingManualRunId={pendingManualRunId}
              onPendingManualRunOpened={() => setPendingManualRunId(null)}
              onRunTriggered={handleWorkflowRunTriggered}
              activeSessionKey={activeSessionKey}
            />
          ) : (
          <>
          <div className="main-workspace-primary flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatWorkspaceHeader
              title={chatTitle}
              isMac={isMac}
              showSidebarToggle={!sidebarOpen && showMainSidebarToggle}
              onToggleSidebar={toggleSidebar}
              rightPanelOpen={rightPanelOpen}
              onToggleRightPanel={toggleRightPanel}
              cwd={cwd}
              gitStatsRefreshKey={gitStatsRefreshKey}
              githubConnected={githubConnection?.connected === true}
              githubFullName={
                githubConnection?.connected === true ? githubConnection.fullName : null
              }
              onConnectGithub={cwd ? () => handleOpenGithubConnect(cwd) : undefined}
              workMode={isEverydayWorkMode}
              workbookPath={activeWorkbookPath}
            />

            {githubConnectTarget ? (
              <GithubConnectDialog
                open={githubConnectOpen}
                projectPath={githubConnectTarget}
                agentReady={githubAgentReady}
                onClose={() => {
                  setGithubConnectOpen(false);
                  setGithubConnectTarget(null);
                }}
                onOpenSourceControlSettings={() => handleOpenSettings("organization")}
                onOpenGithubSettings={() => handleOpenSettings("organization")}
                onConnect={async (options) => {
                  return connectGithubRepo.mutateAsync({
                    projectPath: githubConnectTarget,
                    owner: options.owner,
                    repo: options.repo,
                    remoteUrl: options.remoteUrl,
                  });
                }}
              />
            ) : null}

            <div className="chat-workspace app-region-no-drag">
              <div className={`chat-main${isLandingLayout ? " chat-main-landing" : ""}`}>
              {!isLandingLayout ? (
              <div
                ref={chatScrollRef}
                className="chat-scroll scroll-viewport"
                onScroll={handleChatScroll}
              >
                <div className="chat-column">
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
                </div>
              </div>
              ) : null}

              {isLandingLayout ? (
                <div className="chat-landing-shell">
                  <ChatLanding
                    workMode={isEverydayWorkMode}
                    projects={projects}
                    projectsLoading={projectsLoading}
                    workProjectsRefreshKey={workProjectsRefreshKey}
                    selectedTarget={landingTarget}
                    onSelectTarget={handleLandingSelectTarget}
                    onOpenFolder={() => void handleLandingOpenFolder()}
                    onOpenWorkProject={() => void handleLandingOpenWorkProject()}
                    hidePlanHint={isEverydayWorkMode}
                    composer={
                      <Composer
                        notice={
                          chatNotice ? (
                            <ChatNotice
                              error={chatNotice}
                              onOpenSettings={() => handleOpenSettings("organization")}
                              onDismiss={
                                chatNotice.code === "missing_api_key"
                                  ? undefined
                                  : handleDismissError
                              }
                            />
                          ) : null
                        }
                        segments={draft}
                        onSegmentsChange={handleDraftChange}
                        onSend={() => void handleSend()}
                        onAbort={() => void handleAbort()}
                        noProject={effectiveProjectCwd === null}
                        sessionPending={composerSessionPending}
                        preSessionSend={
                          !activeRuntime && effectiveProjectCwd !== null && !composerProjectReady
                        }
                        apiKeyRequired={chatNotice?.code === "missing_api_key"}
                        isStreaming={isStreaming}
                        projectReady={composerProjectReady}
                        sessionKey={composerSessionKey}
                        contextRefreshKey={contextRefreshKey}
                        visibleModelRefs={chatVisibleModels}
                        onModelChange={() => setContextRefreshKey((k) => k + 1)}
                        onAddModels={() => handleOpenSettings("chat")}
                        onSessionStateSynced={handleSessionStateSynced}
                        swarmMode={swarmMode}
                        onToggleSwarmMode={() => void handleToggleSwarmMode()}
                        planMode={activeRuntime ? planMode : landingPlanMode}
                        onAbortPlanMode={() => handleLandingAbortPlanMode()}
                        onCycleComposerMode={() => handleLandingCycleComposerMode()}
                        onSelectComposerMode={(mode) => void handleSetComposerMode(mode)}
                        hideComposerModes={isEverydayWorkMode}
                        landingLayout
                        pendingQuestion={pendingQuestion}
                        onQuestionPickOption={handleQuestionPickOption}
                        onQuestionPrevious={handleQuestionPrevious}
                        onQuestionSkip={handleQuestionSkip}
                        onQuestionNext={handleQuestionNext}
                        attachedRoots={attachedRoots}
                        onRemoveAttachedRoot={(rootId) => void handleRemoveAttachedRoot(rootId)}
                        onAttachExternalRoots={(roots) => void handleAttachExternalRoots(roots)}
                        onExternalFileMentioned={maybeOpenExternalOfficeFile}
                        hasMessages={composerHasMessages}
                      />
                    }
                  />
                </div>
              ) : (
              <div className="chat-composer-host">
                  <Composer
                  notice={
                    chatNotice ? (
                      <ChatNotice
                        error={chatNotice}
                        onOpenSettings={() => handleOpenSettings("organization")}
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
                  noProject={effectiveProjectCwd === null}
                  sessionPending={composerSessionPending}
                  apiKeyRequired={chatNotice?.code === "missing_api_key"}
                  isStreaming={isStreaming}
                  projectReady={composerProjectReady}
                  sessionKey={composerSessionKey}
                  contextRefreshKey={contextRefreshKey}
                  visibleModelRefs={chatVisibleModels}
                  onModelChange={() => setContextRefreshKey((k) => k + 1)}
                  onAddModels={() => handleOpenSettings("chat")}
                  onSessionStateSynced={handleSessionStateSynced}
                  swarmMode={swarmMode}
                  onToggleSwarmMode={() => void handleToggleSwarmMode()}
                  planMode={planMode}
                  onAbortPlanMode={() => void handleAbortPlanMode()}
                  onCycleComposerMode={() => void handleCycleComposerMode()}
                  onSelectComposerMode={(mode) => void handleSetComposerMode(mode)}
                  hideComposerModes={isEverydayWorkMode}
                  pendingQuestion={pendingQuestion}
                  onQuestionPickOption={handleQuestionPickOption}
                  onQuestionPrevious={handleQuestionPrevious}
                  onQuestionSkip={handleQuestionSkip}
                  onQuestionNext={handleQuestionNext}
                  attachedRoots={attachedRoots}
                  onRemoveAttachedRoot={(rootId) => void handleRemoveAttachedRoot(rootId)}
                  onAttachExternalRoots={(roots) => void handleAttachExternalRoots(roots)}
                  onExternalFileMentioned={maybeOpenExternalOfficeFile}
                  hasMessages={composerHasMessages}
                />
              </div>
              )}
            </div>
            </div>
          </div>

          {rightPanelOpen ? (
            <RightWorkspacePanel
              width={rightPanelWidth}
              onWidthChange={setRightPanelWidth}
              onMinWidthChange={setRightPanelMinWidth}
              resizeContainerRef={chatWorkspaceRef}
              isMac={isMac}
              showUpdateButton={!sidebarOpen && showMainSidebarToggle}
              rightPanelOpen={rightPanelOpen}
              onToggleRightPanel={toggleRightPanel}
              activeTab={rightPanelTab}
              onActiveTabChange={handleRightPanelTabChange}
              cwd={cwd}
              conversationId={activeConversationId}
              sessionKey={activeSessionKey}
              planPhase={planPhase}
              showPlanTab={showPlanTab}
              planRefreshKey={planRefreshKey}
              implementingPlan={implementingPlan}
              onImplementPlan={() => void handleImplementPlan()}
              gitStatsRefreshKey={gitStatsRefreshKey}
              githubConnected={githubConnection?.connected === true}
              githubFullName={
                githubConnection?.connected === true ? githubConnection.fullName : null
              }
              onConnectGithub={cwd ? () => handleOpenGithubConnect(cwd) : undefined}
              onSelectionAction={handleSelectionAction}
              everydayWorkMode={isEverydayWorkMode}
              officeViewActive={rightPanelOfficeView}
              workbookTabs={workbookTabs}
              activeWorkbookPath={activeWorkbookPath}
              activeWorkbookSheet={activeWorkbookSheet}
              workbookRefreshKey={workbookRefreshKey}
              onWorkbookTabSelect={handleWorkbookTabSelect}
              onWorkbookTabClose={handleWorkbookTabClose}
              onWorkbookManualRefresh={handleWorkbookManualRefresh}
              onWorkbookSheetChange={handleWorkbookSheetChange}
            />
          ) : null}
          </>
          )}
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
