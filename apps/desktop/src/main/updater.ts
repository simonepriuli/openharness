import { app, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { AppUpdater } from "electron-updater";
import type { UpdateStatus } from "../preload/api.js";

const { autoUpdater } = electronUpdater;

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

function formatUpdateError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Failed to check for updates";
  if (message.includes("404") && message.includes("releases.atom")) {
    return (
      "Cannot read GitHub Releases (404). If the repository is private, make it public " +
      "or set OPENHARNESS_GITHUB_TOKEN (read-only GitHub PAT) for local testing."
    );
  }
  if (message.includes("latest-mac.yml") || message.includes("ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")) {
    return (
      "No update metadata (latest-mac.yml) on GitHub Releases. The macOS release job " +
      "must finish successfully and upload update files. Cut a new release after CI is green."
    );
  }
  if (message.includes("406") || message.includes("ERR_UPDATER_LATEST_VERSION_NOT_FOUND")) {
    return (
      "Could not resolve the latest GitHub release. Ensure releases are published with " +
      "latest-mac.yml from the Release workflow (not tag-only releases)."
    );
  }
  return message;
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
      message: formatUpdateError(error),
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
  // GitHub no longer returns JSON from /releases/latest (406). Use the atom feed
  // tag order instead of that endpoint to resolve the latest version.
  autoUpdater.allowPrerelease = true;

  wireAutoUpdaterEvents(autoUpdater);

  setTimeout(() => {
    void checkForUpdates();
  }, STARTUP_CHECK_DELAY_MS);
}

export async function checkForUpdates(): Promise<void> {
  if (!isUpdaterEnabled()) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: unknown) {
    sendUpdateStatus({ status: "error", message: formatUpdateError(err) });
  }
}

export function installUpdate(): void {
  if (!isUpdaterEnabled()) return;
  autoUpdater.quitAndInstall(false, true);
}
