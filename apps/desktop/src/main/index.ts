import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAuthIpc, requestElectronAuth, setupAuthProtocol } from "./auth-client.js";
import { clearFileIndex, listProjectFiles, searchProjectFiles, warmFileIndex } from "./file-search.js";
import { readProjectFile } from "./project-file-read.js";
import { unwatchProjectFile, watchProjectFile } from "./project-file-watch.js";
import { getProjectGitStatus, type ProjectGitStatusEntry } from "./project-git-status.js";
import { gitLineStatsForFiles } from "./git-line-stats.js";
import { getGitRemoteInfo } from "./git-remote.js";
import { getWorkflowRunnerInstanceId } from "./runner-instance.js";
import {
  connectGithubProject,
  disconnectGithubProject,
  fetchGithubConnection,
  fetchGithubInstallUrl,
  listOrgGithubConnections,
  listRunnerBindings,
  upsertRunnerBinding,
  createWorkflow,
  deleteWorkflow,
  fetchGithubStatus,
  fetchSessionDiagnostics,
  fetchTeamsConnectUrl,
  fetchDiscordConnectUrl,
  fetchOrganization,
  fetchOrgCanManage,
  fetchOrgOnboardingStatus,
  createOrganizationOnboarding,
  joinOrganizationWithCode,
  fetchOrgInviteCode,
  regenerateOrgInviteCode,
  listOrgMembers,
  removeOrgMember,
  updateOrganization,
  updateOrgMemberRole,
  fetchTeamsStatus,
  fetchDiscordStatus,
  deleteTeamsMapping,
  deleteDiscordMapping,
  listTeamsChannels,
  listDiscordChannels,
  listTeamsForUser,
  listDiscordGuilds,
  listTeamsMappings,
  listDiscordMappings,
  upsertTeamsMapping,
  upsertDiscordMapping,
  fetchWorkflowSettings,
  getWorkflow,
  getWorkflowRunStats,
  listGithubRepos,
  listRepoBranches,
  listWorkflowRuns,
  listWorkflows,
  connectAzureDevOpsOrg,
  disconnectAzureDevOpsOrg,
  fetchAzureDevOpsStatus,
  listAzureDevOpsRepos,
  listSourceControlRepos,
  OpenHarnessApiError,
  triggerWorkflowRun,
  updateWorkflow,
} from "./openharness-api.js";
import {
  clearOpenRouterManagementKey,
  getOpenRouterManagementStatus,
  getStoredOpenRouterAccountCredits,
  invalidateOpenRouterCreditsCache,
  refreshOpenRouterAccountCredits,
  setOpenRouterManagementKey,
} from "./openrouter-management.js";
import {
  clearExaApiKey,
  getExaStatus,
  setExaApiKey,
} from "./exa-config.js";
import {
  clearOpenRouterApiKey,
  clearProviderApiKey,
  getCloudProviders,
  getConfiguredCloudProviders,
  getOpenRouterAuthStatus,
  hasAnyCuratedCloudProviderConfigured,
  isCuratedCloudProvider,
  setOpenRouterApiKey,
  setProviderApiKey,
} from "./pi-auth.js";
import {
  discoverLocalModels,
  getLocalProviders,
  hasLocalProviderConfigured,
  migrateApiForCursorProvidersInFile,
  setLocalProviders,
  testLocalConnection,
} from "./pi-local-providers.js";
import {
  ensurePiAgentDir,
  getGlobalPiSessionsRoot,
  getPiAgentDir,
  setUseGlobalPiConfig,
  syncDefaultModelToPiSettings,
  useGlobalPiConfig,
} from "./pi-config.js";
import {
  listConversationsForCwd,
  listConversationsForCwdAt,
  listProjectsFromGlobalPiSessions,
  listProjectsFromSessions,
} from "./sessions.js";
import { appStore, type AppTheme } from "./store.js";
import { normalizeTitleGenerationModelRef, piSessionManager } from "./pi-service.js";
import { buildStaticSlashMenuItems } from "./thread-tools.js";
import { configureAboutPanel, setApplicationMenu } from "./menu.js";
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate } from "./updater.js";
import { checkForNewModelsAfterUpdate, dismissNewModelsNotice } from "./model-catalog.js";
import { getStoredTokenUsage, recordSessionTokenUsage } from "./token-usage.js";
import { getWorkflowRunner } from "./workflow-runner.js";
import { isWorkflowWorktreeCwd } from "./workflow-git.js";
import { destroyTray, initTray, refreshTrayMenu } from "./tray.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;

// macOS menu items ("About …", "Hide …", "Quit …") use app.getName(), which reads
// package.json "name" ("desktop") unless we override it here.
app.setName("OpenHarness");

setupAuthProtocol(
  () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
);

function storedTheme(): AppTheme {
  return appStore.get("theme") ?? "system";
}

async function buildHarnessSettings() {
  ensurePiAgentDir();
  const openrouter = getOpenRouterAuthStatus();
  const configuredProviders = getConfiguredCloudProviders();
  let canSendMessages =
    hasAnyCuratedCloudProviderConfigured() || hasLocalProviderConfigured();
  if (!canSendMessages) {
    try {
      const models = await piSessionManager.getAvailableModels();
      canSendMessages = models.length > 0;
    } catch {
      canSendMessages = false;
    }
  }
  const rawTitleModel = appStore.get("titleGenerationModel") ?? "";
  return {
    useGlobalPiConfig: useGlobalPiConfig(),
    piAgentDir: getPiAgentDir(),
    theme: appStore.get("theme") ?? "system",
    openrouter,
    openrouterManagement: getOpenRouterManagementStatus(),
    exa: getExaStatus(),
    openrouterAccountCredits: getStoredOpenRouterAccountCredits(),
    tokenUsage: getStoredTokenUsage(),
    configuredProviders,
    swarmDefaultModel: appStore.get("swarmDefaultModel") ?? "",
    chatVisibleModels: appStore.get("chatVisibleModels") ?? [],
    titleGenerationModel: normalizeTitleGenerationModelRef(rawTitleModel),
    canSendMessages,
  };
}

function syncNativeThemeFromStore(): void {
  const theme = storedTheme();
  nativeTheme.themeSource = theme === "system" ? "system" : theme;
}

function mainWindowBackgroundColor(): string {
  if (nativeVibrancyEnabled) return "#00000000";
  return nativeTheme.shouldUseDarkColors ? "#151515" : "#f8fafc";
}

function syncAllWindowsBackground(): void {
  if (nativeVibrancyEnabled) return;
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(mainWindowBackgroundColor());
  }
}

function rememberProjectCwd(cwd: string): void {
  const recent = appStore.get("recentProjectCwds") ?? [];
  const next = [cwd, ...recent.filter((p) => p !== cwd)].slice(0, 24);
  appStore.set("recentProjectCwds", next);

  const removed = appStore.get("removedProjectCwds") ?? [];
  if (removed.includes(cwd)) {
    appStore.set(
      "removedProjectCwds",
      removed.filter((p) => p !== cwd),
    );
  }
}

function removeProjectCwd(cwd: string): void {
  const recent = appStore.get("recentProjectCwds") ?? [];
  appStore.set(
    "recentProjectCwds",
    recent.filter((p) => p !== cwd),
  );

  const removed = appStore.get("removedProjectCwds") ?? [];
  if (!removed.includes(cwd)) {
    appStore.set("removedProjectCwds", [...removed, cwd]);
  }

  if (appStore.get("lastCwd") === cwd) {
    appStore.delete("lastCwd");
  }
}

function ensureProjectOpenHarnessDir(cwd: string): void {
  try {
    mkdirSync(join(cwd, ".openharness"), { recursive: true });
  } catch (error) {
    console.warn("[openharness] Failed to create project .openharness directory", { cwd, error });
  }
}

function mergeProjects() {
  const removed = new Set(appStore.get("removedProjectCwds") ?? []);
  const fromSessions = listProjectsFromSessions().filter(
    (p) => !removed.has(p.cwd) && !isWorkflowWorktreeCwd(p.cwd),
  );
  const recent = (appStore.get("recentProjectCwds") ?? []).filter(
    (cwd) => !removed.has(cwd) && !isWorkflowWorktreeCwd(cwd),
  );
  const byCwd = new Map(fromSessions.map((p) => [p.cwd, p] as const));

  for (const cwd of recent) {
    if (byCwd.has(cwd)) continue;
    byCwd.set(cwd, {
      cwd,
      name: cwd.split(/[/\\]/).filter(Boolean).pop() ?? cwd,
      conversationCount: listConversationsForCwd(cwd).length,
      lastActivityAt: null,
    });
  }

  return [...byCwd.values()].sort((a, b) => {
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });
}

const isDev = !app.isPackaged;

const hardwareAccelerationEnabled =
  process.env.OPENHARNESS_ENABLE_HARDWARE_ACCELERATION === "1";
const nativeVibrancyEnabled =
  process.platform === "darwin" &&
  process.env.OPENHARNESS_DISABLE_NATIVE_VIBRANCY !== "1";

// Transparent macOS vibrancy can destabilize Chromium's GPU process; keep software rendering by default.
if (!hardwareAccelerationEnabled) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
}

function showOrCreateMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  return createWindow();
}

function openSettingsFromTray(): void {
  const window = showOrCreateMainWindow();
  const sendSettingsAction = (): void => {
    window.webContents.send("harness:menu-action", { type: "open-settings" });
  };
  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", sendSettingsAction);
  } else {
    sendSettingsAction();
  }
}

function createWindow(): BrowserWindow {
  const isDarwin = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: "OpenHarness",
    backgroundColor: mainWindowBackgroundColor(),
    ...(isDarwin
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 12 },
          ...(nativeVibrancyEnabled
            ? {
                transparent: true,
                vibrancy: "sidebar" as const,
              }
            : {}),
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  window.webContents.on("did-finish-load", () => {
    void checkForNewModelsAfterUpdate(window);
  });

  window.on("closed", () => {
    mainWindow = null;
    piSessionManager.setWindow(null);
    getWorkflowRunner().setWindow(null);
    getWorkflowRunner().setRendererReady(false);
    void piSessionManager.stopAll();
    if (isDarwin) {
      app.dock?.hide();
      refreshTrayMenu();
    }
  });

  piSessionManager.setWindow(window);
  getWorkflowRunner().setWindow(window);
  initUpdater(window);

  if (isDarwin) {
    app.dock?.show();
  }

  mainWindow = window;
  return window;
}

function registerIpc(): void {
  registerAuthIpc();

  ipcMain.handle("harness:pickDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: appStore.get("lastCwd"),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    const cwd = result.filePaths[0]!;
    ensureProjectOpenHarnessDir(cwd);
    appStore.set("lastCwd", cwd);
    rememberProjectCwd(cwd);
    return { canceled: false as const, cwd };
  });

  ipcMain.handle("harness:listProjects", () => mergeProjects());

  ipcMain.handle("harness:removeProject", (_event, options: { cwd: string }) => {
    removeProjectCwd(options.cwd);
    return { ok: true as const };
  });

  ipcMain.handle("harness:listConversations", (_event, options: { cwd: string }) => {
    return listConversationsForCwd(options.cwd);
  });

  ipcMain.handle("harness:getLastCwd", () => {
    return appStore.get("lastCwd") ?? null;
  });

  ipcMain.handle(
    "harness:start",
    async (
      _event,
      options: { cwd: string; sessionFile?: string; conversationId: string },
    ) => {
      ensurePiAgentDir();
      clearFileIndex();
      const { sessionKey, messages } = await piSessionManager.ensureSession({
        cwd: options.cwd,
        sessionFile: options.sessionFile,
        conversationId: options.conversationId,
      });
      warmFileIndex(options.cwd);
      appStore.set("lastCwd", options.cwd);
      rememberProjectCwd(options.cwd);
      return { ok: true, cwd: options.cwd, sessionKey, messages };
    },
  );

  ipcMain.handle("harness:setActiveSession", (_event, options: { sessionKey: string }) => {
    piSessionManager.setActiveSessionKey(options.sessionKey);
    return { ok: true };
  });

  ipcMain.handle("harness:newSession", async (_event, options: { sessionKey: string }) => {
    return piSessionManager.newSession(options.sessionKey);
  });

  ipcMain.handle("harness:getMessages", async (_event, options: { sessionKey: string }) => {
    return piSessionManager.getMessages(options.sessionKey);
  });

  ipcMain.handle("harness:searchFiles", async (_event, options: { query: string }) => {
    const cwd = piSessionManager.currentCwd;
    if (!cwd) return { files: [] as { relativePath: string }[] };
    try {
      const files = await searchProjectFiles(cwd, options.query ?? "");
      return { files };
    } catch (err) {
      console.error("[harness:searchFiles]", err);
      return { files: [] };
    }
  });

  ipcMain.handle("harness:listProjectFiles", async (_event, options: { cwd: string }) => {
    const cwd = options.cwd?.trim();
    if (!cwd) return { paths: [] as string[] };
    try {
      const paths = await listProjectFiles(cwd);
      return { paths };
    } catch (err) {
      console.error("[harness:listProjectFiles]", err);
      return { paths: [] };
    }
  });

  ipcMain.handle("harness:getProjectGitStatus", async (_event, options: { cwd: string }) => {
    const cwd = options.cwd?.trim();
    if (!cwd) return { entries: [] as ProjectGitStatusEntry[] };
    try {
      const entries = await getProjectGitStatus(cwd);
      return { entries };
    } catch (err) {
      console.error("[harness:getProjectGitStatus]", err);
      return { entries: [] };
    }
  });

  ipcMain.handle(
    "harness:readProjectFile",
    async (_event, options: { cwd: string; relativePath: string }) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
      try {
        return await readProjectFile(cwd, options.relativePath ?? "");
      } catch (err) {
        console.error("[harness:readProjectFile]", err);
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
    },
  );

  ipcMain.handle(
    "harness:watchProjectFile",
    (event, options: { cwd: string; relativePath: string }) => {
      const cwd = options.cwd?.trim();
      if (!cwd || !options.relativePath) {
        unwatchProjectFile(event.sender);
        return { ok: true };
      }
      watchProjectFile(event.sender, cwd, options.relativePath);
      return { ok: true };
    },
  );

  ipcMain.handle("harness:unwatchProjectFile", (event) => {
    unwatchProjectFile(event.sender);
    return { ok: true };
  });

  ipcMain.handle("harness:getSlashCommands", async (_event, options: { sessionKey: string }) => {
    try {
      return await piSessionManager.getSlashCommands(options.sessionKey);
    } catch (err) {
      console.error("[harness:getSlashCommands]", err);
      return { items: [] };
    }
  });

  ipcMain.handle("harness:getStaticSlashCommands", async () => {
    return { items: buildStaticSlashMenuItems() };
  });

  ipcMain.handle("harness:stop", async () => {
    await piSessionManager.stopAll();
    return { ok: true };
  });

  ipcMain.handle(
    "harness:prompt",
    async (
      _event,
      options: {
        sessionKey: string;
        message: string;
        images?: { type: "image"; data: string; mimeType: string }[];
        streamingBehavior?: "steer" | "followUp";
        tools?: import("../shared/thread-tools.js").ToolInvocation[];
      },
    ) => {
      return piSessionManager.prompt(
        options.sessionKey,
        options.message,
        options.streamingBehavior,
        options.images,
        options.tools,
      );
    },
  );

  ipcMain.handle("harness:abort", async (_event, options: { sessionKey: string }) => {
    return piSessionManager.abort(options.sessionKey);
  });

  ipcMain.handle(
    "harness:respondExtensionUi",
    (
      _event,
      options: { sessionKey: string; id: string; value?: string; confirmed?: boolean; cancelled?: true },
    ) => {
      piSessionManager.respondExtensionUi(options.sessionKey, {
        id: options.id,
        value: options.value,
        confirmed: options.confirmed,
        cancelled: options.cancelled,
      });
      return { ok: true };
    },
  );

  ipcMain.handle("harness:getState", async (_event, options: { sessionKey: string }) => {
    return piSessionManager.getState(options.sessionKey);
  });

  ipcMain.handle(
    "harness:getSessionStats",
    async (_event, options: { sessionKey: string }) => {
      const stats = await piSessionManager.getSessionStats(options.sessionKey);
      if (stats) recordSessionTokenUsage(stats);
      return stats;
    },
  );

  ipcMain.handle(
    "harness:getAvailableModels",
    async (_event, options: { sessionKey?: string | null }) => {
      return piSessionManager.getAvailableModels(options.sessionKey);
    },
  );

  ipcMain.handle("harness:getCloudProviders", () => {
    return getCloudProviders();
  });

  ipcMain.handle(
    "harness:setProviderApiKey",
    async (_event, options: { provider: string; apiKey: string }) => {
      if (!isCuratedCloudProvider(options.provider)) {
        throw new Error(`Unsupported provider: ${options.provider}`);
      }
      setProviderApiKey(options.provider, options.apiKey);
      ensurePiAgentDir();
      await piSessionManager.restartAll();
      return { ok: true as const, ...(await buildHarnessSettings()) };
    },
  );

  ipcMain.handle(
    "harness:clearProviderApiKey",
    async (_event, options: { provider: string }) => {
      if (!isCuratedCloudProvider(options.provider)) {
        throw new Error(`Unsupported provider: ${options.provider}`);
      }
      clearProviderApiKey(options.provider);
      ensurePiAgentDir();
      await piSessionManager.restartAll();
      return { ok: true as const, ...(await buildHarnessSettings()) };
    },
  );

  ipcMain.handle("harness:getLocalProviders", () => {
    return getLocalProviders();
  });

  ipcMain.handle(
    "harness:setLocalProviders",
    async (_event, options: { providers: Parameters<typeof setLocalProviders>[0] }) => {
      setLocalProviders(options.providers);
      ensurePiAgentDir();
      await piSessionManager.restartAll();
      return { ok: true };
    },
  );

  ipcMain.handle(
    "harness:discoverLocalModels",
    async (_event, options: { baseUrl: string; apiKey?: string }) => {
      return discoverLocalModels(options);
    },
  );

  ipcMain.handle(
    "harness:testLocalConnection",
    async (_event, options: { baseUrl: string; apiKey?: string }) => {
      return testLocalConnection(options);
    },
  );

  ipcMain.handle(
    "harness:setModel",
    async (
      _event,
      options: { sessionKey: string; provider: string; modelId: string },
    ) => {
      return piSessionManager.setModel(
        options.sessionKey,
        options.provider,
        options.modelId,
      );
    },
  );

  ipcMain.handle(
    "harness:setThinkingLevel",
    async (_event, options: { sessionKey: string; level: string }) => {
      return piSessionManager.setThinkingLevel(options.sessionKey, options.level);
    },
  );

  ipcMain.handle(
    "harness:setSwarmMode",
    async (_event, options: { sessionKey: string; enabled: boolean }) => {
      return piSessionManager.setSwarmMode(options.sessionKey, options.enabled);
    },
  );

  ipcMain.handle("harness:getStatus", () => {
    return {
      running: piSessionManager.isRunning,
      cwd: piSessionManager.currentCwd ?? null,
    };
  });

  ipcMain.handle("harness:getSettings", () => {
    return buildHarnessSettings();
  });

  ipcMain.handle("harness:refreshCredits", async () => {
    return refreshOpenRouterAccountCredits();
  });

  ipcMain.handle(
    "harness:setSettings",
    async (
      _event,
      options: {
        useGlobalPiConfig?: boolean;
        theme?: "system" | "light" | "dark";
        openrouterApiKey?: string;
        clearOpenRouterApiKey?: boolean;
        openrouterManagementKey?: string;
        clearOpenRouterManagementKey?: boolean;
        exaApiKey?: string;
        clearExaApiKey?: boolean;
        swarmDefaultModel?: string;
        chatVisibleModels?: string[];
        titleGenerationModel?: string;
      },
    ) => {
      let configChanged = false;

      if (typeof options.useGlobalPiConfig === "boolean") {
        setUseGlobalPiConfig(options.useGlobalPiConfig);
        configChanged = true;
      }

      if (
        options.theme === "system" ||
        options.theme === "light" ||
        options.theme === "dark"
      ) {
        appStore.set("theme", options.theme);
        syncNativeThemeFromStore();
        syncAllWindowsBackground();
      }

      if (options.clearOpenRouterApiKey) {
        clearOpenRouterApiKey();
        configChanged = true;
      } else if (typeof options.openrouterApiKey === "string") {
        setOpenRouterApiKey(options.openrouterApiKey);
        configChanged = true;
      }

      if (options.clearOpenRouterManagementKey) {
        clearOpenRouterManagementKey();
        invalidateOpenRouterCreditsCache();
        void refreshOpenRouterAccountCredits();
      } else if (typeof options.openrouterManagementKey === "string") {
        setOpenRouterManagementKey(options.openrouterManagementKey);
        invalidateOpenRouterCreditsCache();
        void refreshOpenRouterAccountCredits();
      }

      if (options.clearExaApiKey) {
        clearExaApiKey();
        configChanged = true;
      } else if (typeof options.exaApiKey === "string") {
        setExaApiKey(options.exaApiKey);
        configChanged = true;
      }

      if (typeof options.swarmDefaultModel === "string") {
        const next = options.swarmDefaultModel.trim();
        const previous = (appStore.get("swarmDefaultModel") ?? "").trim();
        if (next) {
          appStore.set("swarmDefaultModel", next);
        } else {
          appStore.delete("swarmDefaultModel");
        }
        configChanged = configChanged || next !== previous;
      }

      if (Array.isArray(options.chatVisibleModels)) {
        const next = [
          ...new Set(
            options.chatVisibleModels
              .filter((ref): ref is string => typeof ref === "string")
              .map((ref) => ref.trim())
              .filter(Boolean),
          ),
        ].slice(0, 5);
        if (next.length === 0) {
          appStore.delete("chatVisibleModels");
        } else {
          appStore.set("chatVisibleModels", next);
        }
        syncDefaultModelToPiSettings();
      }

      if (typeof options.titleGenerationModel === "string") {
        const next = normalizeTitleGenerationModelRef(options.titleGenerationModel);
        if (next) {
          appStore.set("titleGenerationModel", next);
        } else {
          appStore.delete("titleGenerationModel");
        }
      }

      ensurePiAgentDir();

      if (configChanged) {
        await piSessionManager.restartAll();
      }

      return {
        ok: true,
        ...(await buildHarnessSettings()),
      };
    },
  );

  ipcMain.handle("harness:listProjectsFromGlobalPi", () => {
    return listProjectsFromGlobalPiSessions();
  });

  ipcMain.handle("harness:listConversationsFromGlobalPi", (_event, options: { cwd: string }) => {
    return listConversationsForCwdAt(options.cwd, getGlobalPiSessionsRoot());
  });

  ipcMain.handle(
    "harness:generateTitle",
    async (_event, options: { message: string }) => {
      const settings = await buildHarnessSettings();
      if (!settings.canSendMessages) {
        return { title: null };
      }
      const modelRef = settings.titleGenerationModel;
      return {
        title: await piSessionManager.generateTitle(options.message, modelRef),
      };
    },
  );

  ipcMain.handle(
    "harness:getGitLineStats",
    async (_event, options: { cwd: string; filePaths?: string[] }) => {
      try {
        return (await gitLineStatsForFiles(options.cwd, options.filePaths)) ?? null;
      } catch (err) {
        console.error("[harness:getGitLineStats]", err);
        return null;
      }
    },
  );

  ipcMain.handle("harness:getAzureDevOpsStatus", async () => {
    try {
      return await fetchAzureDevOpsStatus();
    } catch (err) {
      console.error("[harness:getAzureDevOpsStatus]", err);
      const message = err instanceof Error ? err.message : "Failed to load Azure DevOps status";
      return {
        configured: true,
        connected: false,
        loginComplete: true,
        agentReady: false,
        connection: null,
        error: message,
      };
    }
  });

  ipcMain.handle(
    "harness:connectAzureDevOps",
    async (_event, options: { orgName: string; pat: string }) => connectAzureDevOpsOrg(options),
  );

  ipcMain.handle("harness:disconnectAzureDevOps", async () => disconnectAzureDevOpsOrg());

  ipcMain.handle(
    "harness:listAzureDevOpsRepos",
    async (_event, options?: { q?: string; page?: number }) => listAzureDevOpsRepos(options),
  );

  ipcMain.handle(
    "harness:listSourceControlRepos",
    async (_event, provider: "github" | "azure_devops", options?: { q?: string; page?: number }) =>
      listSourceControlRepos(provider, options),
  );

  ipcMain.handle("harness:getGithubStatus", async () => {
    try {
      return await fetchGithubStatus();
    } catch (err) {
      console.error("[harness:getGithubStatus]", err);
      const message = err instanceof Error ? err.message : "Failed to load GitHub status";
      const unauthorized = err instanceof OpenHarnessApiError && err.status === 401;
      return {
        configured: !unauthorized,
        loginComplete: false,
        agentReady: false,
        installations: [],
        error: message,
      };
    }
  });

  ipcMain.handle("harness:getGithubInstallUrl", async () => {
    try {
      return await fetchGithubInstallUrl();
    } catch (err) {
      console.error("[harness:getGithubInstallUrl]", err);
      throw err;
    }
  });

  ipcMain.handle("harness:getSessionDiagnostics", async () => {
    try {
      return await fetchSessionDiagnostics();
    } catch (err) {
      console.error("[harness:getSessionDiagnostics]", err);
      return {
        apiBaseUrl: "",
        hasCookie: false,
        diagnostics: {
          error: err instanceof Error ? err.message : "Diagnostics failed",
          status: 0,
        },
      };
    }
  });

  ipcMain.handle("harness:openGithubInstall", async () => {
    const { url } = await fetchGithubInstallUrl();
    await shell.openExternal(url);
    return { ok: true as const };
  });

  ipcMain.handle("harness:getTeamsStatus", async () => {
    try {
      return await fetchTeamsStatus();
    } catch (err) {
      console.error("[harness:getTeamsStatus]", err);
      const message = err instanceof Error ? err.message : "Failed to load Teams status";
      const unauthorized = err instanceof OpenHarnessApiError && err.status === 401;
      return {
        configured: false,
        connected: false,
        installations: [],
        mappings: [],
        ...(unauthorized ? { error: message } : {}),
      };
    }
  });

  ipcMain.handle("harness:openTeamsConnect", async () => {
    const { url } = await fetchTeamsConnectUrl();
    await shell.openExternal(url);
    return { ok: true as const };
  });

  ipcMain.handle("harness:listTeamsMappings", async () => listTeamsMappings());

  ipcMain.handle("harness:getOrganization", async () => fetchOrganization());
  ipcMain.handle("harness:listOrgMembers", async () => listOrgMembers());
  ipcMain.handle("harness:getOrgCanManage", async () => fetchOrgCanManage());
  ipcMain.handle("harness:getOrgOnboardingStatus", async () => fetchOrgOnboardingStatus());
  ipcMain.handle("harness:createOrganization", async (_event, options: { name: string }) =>
    createOrganizationOnboarding(options.name),
  );
  ipcMain.handle("harness:joinOrganizationWithCode", async (_event, options: { code: string }) =>
    joinOrganizationWithCode(options.code),
  );
  ipcMain.handle("harness:getOrgInviteCode", async () => fetchOrgInviteCode());
  ipcMain.handle("harness:regenerateOrgInviteCode", async () => regenerateOrgInviteCode());
  ipcMain.handle(
    "harness:updateOrgMemberRole",
    async (_event, options: { memberId: string; role: "member" | "admin" | "owner" }) =>
      updateOrgMemberRole(options.memberId, options.role),
  );
  ipcMain.handle("harness:removeOrgMember", async (_event, options: { memberId: string }) =>
    removeOrgMember(options.memberId),
  );
  ipcMain.handle("harness:updateOrganization", async (_event, options: { name: string }) =>
    updateOrganization(options.name),
  );

  ipcMain.handle("harness:listTeamsForUser", async () => listTeamsForUser());
  ipcMain.handle("harness:listTeamsChannels", async (_event, options: { teamId: string }) =>
    listTeamsChannels(options.teamId),
  );
  ipcMain.handle(
    "harness:upsertTeamsMapping",
    async (
      _event,
      options: {
        installationId: string;
        teamId: string;
        channelId: string;
        channelName: string;
        githubOwner: string;
        githubRepo: string;
      },
    ) => upsertTeamsMapping(options),
  );
  ipcMain.handle("harness:deleteTeamsMapping", async (_event, options: { mappingId: string }) =>
    deleteTeamsMapping(options.mappingId),
  );

  ipcMain.handle("harness:getDiscordStatus", async () => {
    try {
      return await fetchDiscordStatus();
    } catch (err) {
      console.error("[harness:getDiscordStatus]", err);
      const message = err instanceof Error ? err.message : "Failed to load Discord status";
      const unauthorized = err instanceof OpenHarnessApiError && err.status === 401;
      return {
        configured: false,
        connected: false,
        installations: [],
        mappings: [],
        ...(unauthorized ? { error: message } : {}),
      };
    }
  });

  ipcMain.handle("harness:openDiscordConnect", async () => {
    const { url } = await fetchDiscordConnectUrl();
    await shell.openExternal(url);
    return { ok: true as const };
  });

  ipcMain.handle("harness:listDiscordMappings", async () => listDiscordMappings());
  ipcMain.handle("harness:listDiscordGuilds", async () => listDiscordGuilds());
  ipcMain.handle("harness:listDiscordChannels", async (_event, options: { guildId: string }) =>
    listDiscordChannels(options.guildId),
  );
  ipcMain.handle(
    "harness:upsertDiscordMapping",
    async (
      _event,
      options: {
        installationId: string;
        guildId: string;
        channelId: string;
        channelName: string;
        githubOwner: string;
        githubRepo: string;
      },
    ) => upsertDiscordMapping(options),
  );
  ipcMain.handle("harness:deleteDiscordMapping", async (_event, options: { mappingId: string }) =>
    deleteDiscordMapping(options.mappingId),
  );

  ipcMain.handle("harness:getGitRemoteInfo", async (_event, options: { cwd: string }) => {
    try {
      return await getGitRemoteInfo(options.cwd);
    } catch (err) {
      console.error("[harness:getGitRemoteInfo]", err);
      return { isGitRepo: false, remoteUrl: null, owner: null, repo: null };
    }
  });

  ipcMain.handle(
    "harness:getGithubConnection",
    async (_event, options: { projectPath: string }) => {
      try {
        return await fetchGithubConnection(
          options.projectPath,
          getWorkflowRunnerInstanceId(),
        );
      } catch (err) {
        console.error("[harness:getGithubConnection]", err);
        return { connected: false as const, error: err instanceof Error ? err.message : "Failed" };
      }
    },
  );

  ipcMain.handle(
    "harness:connectGithubRepo",
    async (
      _event,
      options: {
        projectPath: string;
        owner: string;
        repo: string;
        remoteUrl?: string | null;
      },
    ) => {
      return connectGithubProject({
        ...options,
        runnerInstanceId: getWorkflowRunnerInstanceId(),
      });
    },
  );

  ipcMain.handle(
    "harness:disconnectGithubRepo",
    async (_event, options: { projectPath: string }) => {
      return disconnectGithubProject(options.projectPath, getWorkflowRunnerInstanceId());
    },
  );

  ipcMain.handle("harness:listOrgGithubConnections", async () => listOrgGithubConnections());

  ipcMain.handle(
    "harness:listRunnerBindings",
    async (_event, options?: { runnerInstanceId?: string }) =>
      listRunnerBindings({
        runnerInstanceId: options?.runnerInstanceId ?? getWorkflowRunnerInstanceId(),
      }),
  );

  ipcMain.handle(
    "harness:upsertRunnerBinding",
    async (
      _event,
      options: {
        connectionId: string;
        projectPath: string;
        label?: string | null;
      },
    ) =>
      upsertRunnerBinding({
        ...options,
        runnerInstanceId: getWorkflowRunnerInstanceId(),
      }),
  );

  ipcMain.handle("harness:getWorkflowRunnerInstanceId", async () => ({
    runnerInstanceId: getWorkflowRunnerInstanceId(),
  }));

  ipcMain.handle(
    "harness:listGithubRepos",
    async (_event, options?: { q?: string; page?: number }) => {
      return listGithubRepos(options);
    },
  );

  ipcMain.handle(
    "harness:listRepoBranches",
    async (_event, options: { owner: string; repo: string }) => {
      return listRepoBranches(options);
    },
  );

  ipcMain.handle("harness:listWorkflows", async () => {
    try {
      return await listWorkflows();
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      console.error("[harness:listWorkflows]", err);
      throw new Error(err instanceof Error ? err.message : "Failed to load workflows");
    }
  });

  ipcMain.handle("harness:getWorkflow", async (_event, options: { workflowId: string }) => {
    try {
      return await getWorkflow(options.workflowId);
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      throw new Error(err instanceof Error ? err.message : "Failed to load workflow");
    }
  });

  ipcMain.handle(
    "harness:createWorkflow",
    async (
      _event,
      options: Parameters<typeof createWorkflow>[0],
    ) => {
      try {
        return await createWorkflow(options);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) {
          throw new Error(err.message);
        }
        console.error("[harness:createWorkflow]", err);
        throw new Error(err instanceof Error ? err.message : "Failed to create workflow");
      }
    },
  );

  ipcMain.handle(
    "harness:updateWorkflow",
    async (
      _event,
      options: { workflowId: string } & Parameters<typeof updateWorkflow>[1],
    ) => {
      try {
        const { workflowId, ...patch } = options;
        return await updateWorkflow(workflowId, patch);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to update workflow");
      }
    },
  );

  ipcMain.handle("harness:deleteWorkflow", async (_event, options: { workflowId: string }) => {
    try {
      return await deleteWorkflow(options.workflowId);
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      throw new Error(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  });

  ipcMain.handle("harness:triggerWorkflowRun", async (_event, options: { workflowId: string }) => {
    try {
      return await triggerWorkflowRun(options.workflowId);
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      throw new Error(err instanceof Error ? err.message : "Failed to run workflow");
    }
  });

  ipcMain.handle(
    "harness:listWorkflowRuns",
    async (_event, options?: { workflowId?: string; limit?: number; cursor?: string }) => {
      try {
        return await listWorkflowRuns(options);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to load workflow runs");
      }
    },
  );

  ipcMain.handle(
    "harness:getWorkflowRunStats",
    async (_event, options?: { workflowId?: string }) => {
      try {
        return await getWorkflowRunStats(options?.workflowId);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to load workflow stats");
      }
    },
  );

  ipcMain.handle("harness:getWorkflowSettings", async () => {
    try {
      return await fetchWorkflowSettings();
    } catch (err) {
      if (err instanceof OpenHarnessApiError) {
        throw new Error(err.message);
      }
      console.error("[harness:getWorkflowSettings]", err);
      throw new Error(err instanceof Error ? err.message : "Failed to load workflow settings");
    }
  });

  ipcMain.handle("harness:syncWorkflowConversations", () => {
    getWorkflowRunner().setRendererReady(true);
    return { ok: true };
  });

  ipcMain.handle("harness:getAppVersion", () => app.getVersion());

  ipcMain.handle("harness:requestElectronAuth", () => requestElectronAuth());

  ipcMain.handle("harness:checkForUpdates", async () => {
    await checkForUpdates();
  });

  ipcMain.handle("harness:getUpdateStatus", () => getUpdateStatus());

  ipcMain.handle("harness:installUpdate", () => {
    installUpdate();
  });

  ipcMain.handle(
    "harness:dismissNewModelsNotice",
    (_event, options: { version: string }) => {
      dismissNewModelsNotice(options.version);
    },
  );
}

app.whenReady().then(async () => {
  syncNativeThemeFromStore();
  configureAboutPanel();
  setApplicationMenu();
  nativeTheme.on("updated", () => {
    syncAllWindowsBackground();
  });
  ensurePiAgentDir();
  syncDefaultModelToPiSettings();
  if (migrateApiForCursorProvidersInFile()) {
    await piSessionManager.restartAll();
  }
  registerIpc();
  if (process.platform === "darwin") {
    initTray({
      showOrCreateMainWindow,
      openSettings: openSettingsFromTray,
    });
  }
  createWindow();
  getWorkflowRunner().start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showOrCreateMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    getWorkflowRunner().stop();
    void piSessionManager.stopAll();
    app.quit();
  }
});

app.on("before-quit", () => {
  getWorkflowRunner().stop();
  void piSessionManager.stopAll();
  destroyTray();
});
