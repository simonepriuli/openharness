import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearFileIndex, searchProjectFiles, warmFileIndex } from "./file-search.js";
import { gitLineStatsForFiles } from "./git-line-stats.js";
import {
  clearOpenRouterManagementKey,
  getOpenRouterManagementStatus,
  getStoredOpenRouterAccountCredits,
  invalidateOpenRouterCreditsCache,
  refreshOpenRouterAccountCredits,
  setOpenRouterManagementKey,
} from "./openrouter-management.js";
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
import { configureAboutPanel, setApplicationMenu } from "./menu.js";
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate } from "./updater.js";
import { checkForNewModelsAfterUpdate, dismissNewModelsNotice } from "./model-catalog.js";
import { getStoredTokenUsage, recordSessionTokenUsage } from "./token-usage.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// macOS menu items ("About …", "Hide …", "Quit …") use app.getName(), which reads
// package.json "name" ("desktop") unless we override it here.
app.setName("OpenHarness");

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
  const fromSessions = listProjectsFromSessions().filter((p) => !removed.has(p.cwd));
  const recent = (appStore.get("recentProjectCwds") ?? []).filter((cwd) => !removed.has(cwd));
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

function createWindow(): BrowserWindow {
  const isDarwin = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
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

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.on("did-finish-load", () => {
    void checkForNewModelsAfterUpdate(mainWindow);
  });

  piSessionManager.setWindow(mainWindow);
  initUpdater(mainWindow);
  return mainWindow;
}

function registerIpc(): void {
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
      },
    ) => {
      return piSessionManager.prompt(
        options.sessionKey,
        options.message,
        options.streamingBehavior,
        options.images,
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

  ipcMain.handle("harness:getAppVersion", () => app.getVersion());

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
  if (migrateApiForCursorProvidersInFile()) {
    await piSessionManager.restartAll();
  }
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  void piSessionManager.stopAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void piSessionManager.stopAll();
});
