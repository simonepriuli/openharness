import { app, type BrowserWindow } from "electron";
import { autoUpdater, type AppUpdater } from "electron-updater";
import type { UpdateStatus } from "../preload/api.js";

const STARTUP_CHECK_DELAY_MS = 3_000;

let mainWindow: BrowserWindow | null = null;
let initialized = false;
let pendingVersion: string | null = null;

export function isUpdaterEnabled(): boolean {
  return app.isPackaged || process.env.OPENHARNESS_ENABLE_UPDATER === "1";
}

function sendUpdateStatus(status: UpdateStatus): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("harness:update-status", status);
}

function wireAutoUpdaterEvents(updater: AppUpdater): void {
  updater.on("checking-for-update", () => {
    sendUpdateStatus({ status: "checking" });
  });

  updater.on("update-available", (info) => {
    pendingVersion = info.version;
    sendUpdateStatus({
      status: "available",
      version: info.version,
    });
  });

  updater.on("update-not-available", () => {
    sendUpdateStatus({ status: "not-available" });
  });

  updater.on("download-progress", (progress) => {
    sendUpdateStatus({
      status: "downloading",
      version: pendingVersion ?? "unknown",
      progress: progress.percent,
    });
  });

  updater.on("update-downloaded", (info) => {
    sendUpdateStatus({
      status: "downloaded",
      version: info.version,
    });
  });

  updater.on("error", (error) => {
    sendUpdateStatus({
      status: "error",
      message: error.message,
    });
  });
}

export function getAppUpdater(): AppUpdater | null {
  if (!isUpdaterEnabled()) return null;
  return autoUpdater;
}

export function initUpdater(win: BrowserWindow): void {
  if (!isUpdaterEnabled()) return;

  mainWindow = win;
  if (initialized) return;

  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = console;

  wireAutoUpdaterEvents(autoUpdater);

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to check for updates";
      sendUpdateStatus({ status: "error", message });
    });
  }, STARTUP_CHECK_DELAY_MS);
}

export async function checkForUpdates(): Promise<void> {
  if (!isUpdaterEnabled()) return;
  await autoUpdater.checkForUpdates();
}

export function installUpdate(): void {
  if (!isUpdaterEnabled()) return;
  autoUpdater.quitAndInstall(false, true);
}
