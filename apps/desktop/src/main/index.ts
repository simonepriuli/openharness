import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { clearFileIndex, searchProjectFiles, warmFileIndex } from "./file-search.js";
import { listConversationsForCwd, listProjectsFromSessions } from "./sessions.js";
import { appStore } from "./store.js";
import { piService } from "./pi-service.js";

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
    backgroundColor: nativeVibrancyEnabled ? "#00000000" : "#f8fafc",
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

  piService.setWindow(mainWindow);
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
    async (_event, options: { cwd: string; sessionFile?: string }) => {
      clearFileIndex();
      const messages = await piService.start(options.cwd, options.sessionFile);
      warmFileIndex(options.cwd);
      appStore.set("lastCwd", options.cwd);
      rememberProjectCwd(options.cwd);
      return { ok: true, cwd: options.cwd, messages };
    },
  );

  ipcMain.handle("harness:newSession", async () => {
    return piService.newSession();
  });

  ipcMain.handle("harness:getMessages", async () => {
    return piService.getMessages();
  });

  ipcMain.handle("harness:searchFiles", async (_event, options: { query: string }) => {
    const cwd = piService.currentCwd;
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
    await piService.stop();
    return { ok: true };
  });

  ipcMain.handle(
    "harness:prompt",
    async (_event, options: { message: string; streamingBehavior?: "steer" | "followUp" }) => {
      return piService.prompt(options.message, options.streamingBehavior);
    },
  );

  ipcMain.handle("harness:abort", async () => {
    return piService.abort();
  });

  ipcMain.handle("harness:getState", async () => {
    return piService.getState();
  });

  ipcMain.handle("harness:getSessionStats", async () => {
    return piService.getSessionStats();
  });

  ipcMain.handle("harness:getStatus", () => {
    return {
      running: piService.isRunning,
      cwd: piService.currentCwd ?? null,
    };
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  void piService.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void piService.stop();
});
