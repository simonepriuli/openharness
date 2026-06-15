import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearFileIndex, searchProjectFiles, warmFileIndex } from "./file-search.js";
import {
  clearOpenRouterManagementKey,
  getCachedOpenRouterAccountCredits,
  getOpenRouterManagementStatus,
  setOpenRouterManagementKey,
} from "./openrouter-management.js";
import {
  clearOpenRouterApiKey,
  getOpenRouterAuthStatus,
  setOpenRouterApiKey,
} from "./pi-auth.js";
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
import { piSessionManager } from "./pi-service.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function storedTheme(): AppTheme {
  return appStore.get("theme") ?? "system";
}

async function buildHarnessSettings() {
  ensurePiAgentDir();
  return {
    useGlobalPiConfig: useGlobalPiConfig(),
    piAgentDir: getPiAgentDir(),
    theme: appStore.get("theme") ?? "system",
    openrouter: getOpenRouterAuthStatus(),
    openrouterManagement: getOpenRouterManagementStatus(),
    openrouterAccountCredits: await getCachedOpenRouterAccountCredits(),
    swarmDefaultModel: appStore.get("swarmDefaultModel") ?? "",
    chatVisibleModels: appStore.get("chatVisibleModels") ?? [],
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
}

function mergeProjects() {
  const fromSessions = listProjectsFromSessions();
  const recent = appStore.get("recentProjectCwds") ?? [];
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
    width: 1280,
    height: 800,
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

  piSessionManager.setWindow(mainWindow);
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
    appStore.set("lastCwd", cwd);
    rememberProjectCwd(cwd);
    return { canceled: false as const, cwd };
  });

  ipcMain.handle("harness:listProjects", () => mergeProjects());

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
        streamingBehavior?: "steer" | "followUp";
      },
    ) => {
      return piSessionManager.prompt(
        options.sessionKey,
        options.message,
        options.streamingBehavior,
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
      return piSessionManager.getSessionStats(options.sessionKey);
    },
  );

  ipcMain.handle(
    "harness:getAvailableModels",
    async (_event, options: { sessionKey: string }) => {
      return piSessionManager.getAvailableModels(options.sessionKey);
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
      } else if (typeof options.openrouterManagementKey === "string") {
        setOpenRouterManagementKey(options.openrouterManagementKey);
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
}

app.whenReady().then(() => {
  syncNativeThemeFromStore();
  nativeTheme.on("updated", () => {
    syncAllWindowsBackground();
  });
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
