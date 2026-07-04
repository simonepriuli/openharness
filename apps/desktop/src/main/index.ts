import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAuthIpc, requestElectronAuth, setupAuthProtocol } from "./auth-client.js";
import { clearFileIndex, listProjectFiles, searchFilesAcrossRoots, warmFileIndex } from "./file-search.js";
import { attachedRootFromPickedPath } from "./external-paths.js";
import { dedupeAttachedRoots } from "../shared/path-grants.js";
import type { AttachedRoot } from "../shared/path-grants.js";
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from "../shared/window-bounds.js";
import { readProjectFile } from "./project-file-read.js";
import { writeProjectFile } from "./project-file-write.js";
import {
  clearMarkdownEditLocks,
  getMarkdownEditLocks,
  setMarkdownEditLock,
} from "./markdown-edit-lock.js";
import { unwatchProjectFile, watchProjectFile } from "./project-file-watch.js";
import {
  listOfficeOpenWithApps,
  listWorkbookFiles,
  listWorkbookOpenWithApps,
  openOfficeWith,
  openWorkbookWith,
  readOfficeFile,
  readWorkbookFile,
  type OpenOfficeWithTarget,
  type OpenWorkbookWithTarget,
} from "./workbook-files.js";
import { unwatchOfficeFile, unwatchWorkbookFile, watchOfficeFile, watchWorkbookFile } from "./workbook-file-watch.js";
import { getProjectGitStatus, type ProjectGitStatusEntry } from "./project-git-status.js";
import { getProjectUnstagedChanges, type ProjectUnstagedChanges } from "./project-unstaged-changes.js";
import { deletePlanFile, readPlanFile } from "./project-plan.js";
import { deleteDebugFile, readDebugFile } from "./project-debug.js";
import { gitLineStatsForFiles } from "./git-line-stats.js";
import { getGitRemoteInfo } from "./git-remote.js";
import { getWorkflowRunnerInstanceId } from "./runner-instance.js";
import {
  connectGithubProject,
  connectSourceControlProject,
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
  fetchLinearConnectUrl,
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
  fetchOrgSecrets,
  upsertOrgSecret,
  deleteOrgSecret,
  deleteRepoEnvironmentVariable,
  fetchTeamsStatus,
  fetchDiscordStatus,
  fetchLinearStatus,
  fetchLinearAgentConfigs,
  fetchLinearAgentSessions,
  upsertLinearAgentConfig,
  deleteTeamsMapping,
  deleteDiscordMapping,
  deleteLinearInstallation,
  listTeamsChannels,
  listDiscordChannels,
  listTeamsForUser,
  listDiscordGuilds,
  listTeamsMappings,
  listDiscordMappings,
  listLinearMappings,
  listLinearProjects,
  upsertTeamsMapping,
  upsertDiscordMapping,
  upsertLinearMapping,
  deleteLinearMapping,
  fetchWorkflowSettings,
  getWorkflow,
  getWorkflowRunStats,
  getWorkflowRun,
  listWorkflowRunEvents,
  dismissWorkflowRun,
  listGithubRepos,
  listRepoBranches,
  listRepoEnvironmentVariables,
  listRepoEnvironments,
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
  upsertRepoEnvironmentVariable,
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
  cancelOAuthLogin,
  clearOAuthProvider,
  getOAuthProviders,
  hasAnyOAuthProviderConfigured,
  isCuratedOAuthProvider,
  isOAuthLoginInProgress,
  runOAuthLogin,
} from "./pi-oauth.js";
import { getActiveOrgSecretSlots, syncOrgSecrets } from "./org-secrets-sync.js";
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
  syncDefaultModelToPiSettings,
} from "./pi-config.js";
import {
  listConversationsForCwd,
  listProjectsFromSessions,
} from "./sessions.js";
import { appStore, type AppTheme } from "./store.js";
import { normalizeTitleGenerationModelRef, piSessionManager, resolveWorkflowSummarizationModelRef } from "./pi-service.js";
import { buildStaticSlashMenuItems } from "./thread-tools.js";
import { configureAboutPanel, setApplicationMenu } from "./menu.js";
import {
  checkForUpdates,
  getUpdateStatus,
  initUpdater,
  installUpdate,
  isUpdaterEnabled,
} from "./updater.js";
import { checkForNewModelsAfterUpdate, dismissNewModelsNotice } from "./model-catalog.js";
import { getStoredTokenUsage, recordSessionTokenUsage } from "./token-usage.js";
import { getWorkflowRunner } from "./workflow-runner.js";
import { isWorkflowWorktreeCwd } from "./workflow-git.js";
import {
  ensureWorkWorkspace,
  isWorkWorkspaceCwd,
} from "./work-workspace.js";
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
    hasAnyCuratedCloudProviderConfigured() ||
    hasAnyOAuthProviderConfigured() ||
    hasLocalProviderConfigured();
  if (!canSendMessages) {
    try {
      const models = await piSessionManager.getAvailableModels();
      canSendMessages = models.length > 0;
    } catch {
      canSendMessages = false;
    }
  }
  const rawTitleModel = appStore.get("titleGenerationModel") ?? "";
  const rawSummarizationModel = appStore.get("workflowSummarizationModel") ?? "";
  return {
    theme: appStore.get("theme") ?? "system",
    workMode: appStore.get("workMode") ?? "coding",
    openrouter,
    openrouterManagement: getOpenRouterManagementStatus(),
    exa: getExaStatus(),
    openrouterAccountCredits: getStoredOpenRouterAccountCredits(),
    tokenUsage: getStoredTokenUsage(),
    configuredProviders,
    swarmDefaultModel: appStore.get("swarmDefaultModel") ?? "",
    chatVisibleModels: appStore.get("chatVisibleModels") ?? [],
    titleGenerationModel: normalizeTitleGenerationModelRef(rawTitleModel),
    workflowSummarizationModel: resolveWorkflowSummarizationModelRef(
      rawSummarizationModel,
      rawTitleModel,
    ),
    canSendMessages,
  };
}

function syncNativeThemeFromStore(): void {
  const theme = storedTheme();
  nativeTheme.themeSource = theme === "system" ? "system" : theme;
}

function mainWindowBackgroundColor(): string {
  if (nativeVibrancyEnabled) return "#00000000";
  return nativeTheme.shouldUseDarkColors ? "#151515" : "#f4f4f4";
}

function syncAllWindowsBackground(): void {
  if (nativeVibrancyEnabled) return;
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(mainWindowBackgroundColor());
  }
}

function rememberProjectCwd(cwd: string): void {
  if (isWorkWorkspaceCwd(cwd)) return;
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
    (p) => !removed.has(p.cwd) && !isWorkflowWorktreeCwd(p.cwd) && !isWorkWorkspaceCwd(p.cwd),
  );
  const recent = (appStore.get("recentProjectCwds") ?? []).filter(
    (cwd) => !removed.has(cwd) && !isWorkflowWorktreeCwd(cwd) && !isWorkWorkspaceCwd(cwd),
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
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
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

  ipcMain.handle(
    "harness:pickDirectory",
    async (_event, options?: { skipOpenHarness?: boolean }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        defaultPath: appStore.get("lastCwd"),
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true as const };
      }
      const cwd = result.filePaths[0]!;
      if (!options?.skipOpenHarness) {
        ensureProjectOpenHarnessDir(cwd);
      }
      appStore.set("lastCwd", cwd);
      rememberProjectCwd(cwd);
      return { canceled: false as const, cwd };
    },
  );

  ipcMain.handle("harness:listProjects", () => mergeProjects());

  ipcMain.handle("harness:removeProject", (_event, options: { cwd: string }) => {
    removeProjectCwd(options.cwd);
    return { ok: true as const };
  });

  ipcMain.handle("harness:listConversations", (_event, options: { cwd: string }) => {
    return listConversationsForCwd(options.cwd);
  });

  ipcMain.handle("harness:getWorkWorkspacePath", () => {
    return ensureWorkWorkspace();
  });

  ipcMain.handle("harness:getLastCwd", () => {
    return appStore.get("lastCwd") ?? null;
  });

  ipcMain.handle(
    "harness:start",
    async (
      _event,
      options: {
        cwd: string;
        sessionFile?: string;
        conversationId: string;
        conversationContext?: "coding" | "work" | "work-project";
        attachedRoots?: AttachedRoot[];
      },
    ) => {
      ensurePiAgentDir();
      clearFileIndex();
      const { sessionKey, messages } = await piSessionManager.ensureSession({
        cwd: options.cwd,
        sessionFile: options.sessionFile,
        conversationId: options.conversationId,
        conversationContext: options.conversationContext,
        attachedRoots: options.attachedRoots,
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

  ipcMain.handle("harness:searchFiles", async (_event, options: { query: string; sessionKey?: string }) => {
    const searchContext = options.sessionKey
      ? piSessionManager.getRuntimeSearchRoots(options.sessionKey)
      : piSessionManager.currentCwd
        ? { cwd: piSessionManager.currentCwd, grants: [] as AttachedRoot[] }
        : null;
    if (!searchContext?.cwd) return { files: [] as { relativePath: string }[] };
    try {
      const files = await searchFilesAcrossRoots(
        [{ cwd: searchContext.cwd, grants: searchContext.grants }],
        options.query ?? "",
      );
      return { files };
    } catch (err) {
      console.error("[harness:searchFiles]", err);
      return { files: [] };
    }
  });

  ipcMain.handle(
    "harness:pickExternalPaths",
    async (_event, options?: { multi?: boolean }) => {
      const result = await dialog.showOpenDialog({
        properties: [
          "openFile",
          "openDirectory",
          "createDirectory",
          ...(options?.multi ? (["multiSelections"] as const) : []),
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true as const };
      }
      return {
        canceled: false as const,
        paths: result.filePaths.map((pickedPath) => attachedRootFromPickedPath(pickedPath)),
      };
    },
  );

  ipcMain.handle("harness:attachedRootsFromPaths", (_event, paths: string[]) => {
    return paths.map((pickedPath) => attachedRootFromPickedPath(pickedPath));
  });

  ipcMain.handle(
    "harness:setAttachedRoots",
    (_event, options: { sessionKey: string; roots: AttachedRoot[] }) => {
      const roots = piSessionManager.setAttachedRoots(
        options.sessionKey,
        dedupeAttachedRoots(options.roots ?? []),
      );
      return { ok: true as const, roots };
    },
  );

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

  ipcMain.handle("harness:getProjectUnstagedChanges", async (_event, options: { cwd: string }) => {
    const cwd = options.cwd?.trim();
    if (!cwd) return { files: [], patch: "" } satisfies ProjectUnstagedChanges;
    try {
      return await getProjectUnstagedChanges(cwd);
    } catch (err) {
      console.error("[harness:getProjectUnstagedChanges]", err);
      return { files: [], patch: "" };
    }
  });

  ipcMain.handle(
    "harness:readProjectFile",
    async (
      _event,
      options: { cwd: string; relativePath: string; sessionKey?: string },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      try {
        return await readProjectFile(cwd, options.relativePath ?? "", grants);
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
    "harness:writeProjectFile",
    async (
      _event,
      options: { cwd: string; relativePath: string; contents: string; sessionKey?: string },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      try {
        return await writeProjectFile(
          cwd,
          options.relativePath ?? "",
          options.contents ?? "",
          grants,
        );
      } catch (err) {
        console.error("[harness:writeProjectFile]", err);
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
    },
  );

  ipcMain.handle(
    "harness:setMarkdownEditLock",
    (
      _event,
      options: { sessionKey: string; relativePath: string; locked: boolean },
    ) => {
      return setMarkdownEditLock(
        options.sessionKey ?? "",
        options.relativePath ?? "",
        options.locked === true,
      );
    },
  );

  ipcMain.handle("harness:getMarkdownEditLocks", (_event, options: { sessionKey: string }) => {
    return { lockedPaths: getMarkdownEditLocks(options.sessionKey ?? "") };
  });

  ipcMain.handle("harness:clearMarkdownEditLocks", (_event, options: { sessionKey: string }) => {
    clearMarkdownEditLocks(options.sessionKey ?? "");
    return { ok: true };
  });

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

  ipcMain.handle(
    "harness:readWorkbookFile",
    async (
      _event,
      options: { cwd: string; relativePath: string; sessionKey?: string },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      try {
        return await readWorkbookFile(cwd, options.relativePath ?? "", grants);
      } catch (err) {
        console.error("[harness:readWorkbookFile]", err);
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
    },
  );

  ipcMain.handle("harness:listWorkbookFiles", async (_event, options: { cwd: string }) => {
    const cwd = options.cwd?.trim();
    if (!cwd) {
      return { paths: [] as string[] };
    }
    try {
      const paths = await listWorkbookFiles(cwd);
      return { paths };
    } catch (err) {
      console.error("[harness:listWorkbookFiles]", err);
      return { paths: [] as string[] };
    }
  });

  ipcMain.handle(
    "harness:watchWorkbookFile",
    (event, options: { cwd: string; relativePath: string; sessionKey?: string }) => {
      const cwd = options.cwd?.trim();
      if (!cwd || !options.relativePath) {
        unwatchWorkbookFile(event.sender);
        return { ok: true };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      watchWorkbookFile(event.sender, cwd, options.relativePath, grants);
      return { ok: true };
    },
  );

  ipcMain.handle("harness:unwatchWorkbookFile", (event) => {
    unwatchWorkbookFile(event.sender);
    return { ok: true };
  });

  ipcMain.handle(
    "harness:openWorkbookWith",
    async (
      _event,
      options: { cwd: string; relativePath: string; target: OpenWorkbookWithTarget; sessionKey?: string },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return { ok: false as const, error: "Workbook not found." };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      return openWorkbookWith(cwd, options.relativePath ?? "", options.target ?? "default", grants);
    },
  );

  ipcMain.handle("harness:listWorkbookOpenWithApps", async () => {
    try {
      return await listWorkbookOpenWithApps();
    } catch (err) {
      console.error("[harness:listWorkbookOpenWithApps]", err);
      return [{ id: "default" as const, label: "Default App" }];
    }
  });

  ipcMain.handle(
    "harness:readOfficeFile",
    async (
      _event,
      options: { cwd: string; relativePath: string; sessionKey?: string },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      try {
        return await readOfficeFile(cwd, options.relativePath ?? "", grants);
      } catch (err) {
        console.error("[harness:readOfficeFile]", err);
        return {
          ok: false as const,
          relativePath: options.relativePath,
          error: "not_found" as const,
        };
      }
    },
  );

  ipcMain.handle(
    "harness:watchOfficeFile",
    (event, options: { cwd: string; relativePath: string; sessionKey?: string }) => {
      const cwd = options.cwd?.trim();
      if (!cwd || !options.relativePath) {
        unwatchOfficeFile(event.sender);
        return { ok: true };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      watchOfficeFile(event.sender, cwd, options.relativePath, grants);
      return { ok: true };
    },
  );

  ipcMain.handle("harness:unwatchOfficeFile", (event) => {
    unwatchOfficeFile(event.sender);
    return { ok: true };
  });

  ipcMain.handle(
    "harness:openOfficeWith",
    async (
      _event,
      options: {
        cwd: string;
        relativePath: string;
        target: OpenOfficeWithTarget;
        sessionKey?: string;
      },
    ) => {
      const cwd = options.cwd?.trim();
      if (!cwd) {
        return { ok: false as const, error: "Document not found." };
      }
      const grants = options.sessionKey
        ? piSessionManager.getAttachedRoots(options.sessionKey)
        : [];
      return openOfficeWith(cwd, options.relativePath ?? "", options.target ?? "default", grants);
    },
  );

  ipcMain.handle(
    "harness:listOfficeOpenWithApps",
    async (_event, options?: { kind?: "docx" | "xlsx" }) => {
      try {
        return await listOfficeOpenWithApps(options?.kind);
      } catch (err) {
        console.error("[harness:listOfficeOpenWithApps]", err);
        return [];
      }
    },
  );

  ipcMain.handle("harness:getSlashCommands", async (_event, options: { sessionKey: string }) => {
    try {
      return await piSessionManager.getSlashCommands(options.sessionKey);
    } catch (err) {
      console.error("[harness:getSlashCommands]", err);
      return { items: [] };
    }
  });

  ipcMain.handle("harness:getStaticSlashCommands", async () => {
    return { items: await buildStaticSlashMenuItems({ includeWorkflowNotifyTools: true }) };
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

  ipcMain.handle("harness:getOAuthProviders", () => {
    return getOAuthProviders();
  });

  ipcMain.handle(
    "harness:startOAuthLogin",
    async (event, options: { providerId: string }) => {
      if (!isCuratedOAuthProvider(options.providerId)) {
        throw new Error(`Unsupported OAuth provider: ${options.providerId}`);
      }
      if (isOAuthLoginInProgress()) {
        throw new Error("An OAuth login is already in progress.");
      }

      const sender = event.sender;
      void runOAuthLogin(options.providerId, {
        onDeviceCode: (payload) => {
          sender.send("harness:oauth-device-code", payload);
        },
        onProgress: (message) => {
          sender.send("harness:oauth-login-progress", { message });
        },
        onComplete: async (providerId) => {
          ensurePiAgentDir();
          await piSessionManager.restartAll();
          sender.send("harness:oauth-login-complete", { providerId });
        },
        onFailed: (message) => {
          sender.send("harness:oauth-login-failed", {
            providerId: options.providerId,
            message,
          });
        },
      });

      return { started: true as const };
    },
  );

  ipcMain.handle("harness:cancelOAuthLogin", () => {
    cancelOAuthLogin();
    return { ok: true as const };
  });

  ipcMain.handle(
    "harness:logoutOAuthProvider",
    async (_event, options: { providerId: string }) => {
      if (!isCuratedOAuthProvider(options.providerId)) {
        throw new Error(`Unsupported OAuth provider: ${options.providerId}`);
      }
      clearOAuthProvider(options.providerId);
      ensurePiAgentDir();
      await piSessionManager.restartAll();
      return { ok: true as const, ...(await buildHarnessSettings()) };
    },
  );

  ipcMain.handle("harness:openExternal", async (_event, options: { url: string }) => {
    const url = options.url?.trim();
    if (!url) {
      throw new Error("URL is required");
    }
    await shell.openExternal(url);
    return { ok: true as const };
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

  ipcMain.handle(
    "harness:setPlanMode",
    async (
      _event,
      options: { sessionKey: string; enabled: boolean; conversationId?: string },
    ) => {
      return piSessionManager.setPlanMode(
        options.sessionKey,
        options.enabled,
        options.conversationId,
      );
    },
  );

  ipcMain.handle(
    "harness:setDebugMode",
    async (
      _event,
      options: { sessionKey: string; enabled: boolean; conversationId?: string },
    ) => {
      return piSessionManager.setDebugMode(
        options.sessionKey,
        options.enabled,
        options.conversationId,
      );
    },
  );

  ipcMain.handle(
    "harness:setDebugReportWritten",
    async (_event, options: { sessionKey: string; written: boolean }) => {
      return piSessionManager.setDebugReportWritten(options.sessionKey, options.written);
    },
  );

  ipcMain.handle(
    "harness:getPlanFile",
    async (_event, options: { cwd: string; conversationId: string }) => {
      try {
        return await readPlanFile(options.cwd, options.conversationId);
      } catch (err) {
        console.error("[harness:getPlanFile]", err);
        return {
          ok: false as const,
          relativePath: `.openharness/plans/${options.conversationId}.md`,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "harness:deletePlanFile",
    async (_event, options: { cwd: string; conversationId: string }) => {
      try {
        await deletePlanFile(options.cwd, options.conversationId);
        return { ok: true };
      } catch (err) {
        console.error("[harness:deletePlanFile]", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle(
    "harness:getDebugFile",
    async (_event, options: { cwd: string; conversationId: string }) => {
      try {
        return await readDebugFile(options.cwd, options.conversationId);
      } catch (err) {
        console.error("[harness:getDebugFile]", err);
        return {
          ok: false as const,
          relativePath: `.openharness/debug/${options.conversationId}.md`,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "harness:deleteDebugFile",
    async (_event, options: { cwd: string; conversationId: string }) => {
      try {
        await deleteDebugFile(options.cwd, options.conversationId);
        return { ok: true };
      } catch (err) {
        console.error("[harness:deleteDebugFile]", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
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
        workflowSummarizationModel?: string;
        workMode?: "coding" | "everyday";
      },
    ) => {
      let configChanged = false;

      if (
        options.theme === "system" ||
        options.theme === "light" ||
        options.theme === "dark"
      ) {
        appStore.set("theme", options.theme);
        syncNativeThemeFromStore();
        syncAllWindowsBackground();
      }

      if (options.workMode === "coding" || options.workMode === "everyday") {
        appStore.set("workMode", options.workMode);
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

      if (typeof options.workflowSummarizationModel === "string") {
        const next = normalizeTitleGenerationModelRef(options.workflowSummarizationModel);
        if (next) {
          appStore.set("workflowSummarizationModel", next);
        } else {
          appStore.delete("workflowSummarizationModel");
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
  ipcMain.handle("harness:createOrganization", async (_event, options: { name: string }) => {
    const result = await createOrganizationOnboarding(options.name);
    await syncOrgSecrets().catch((err) => {
      console.warn("[org-secrets] post-create sync failed", err);
    });
    return result;
  });
  ipcMain.handle("harness:joinOrganizationWithCode", async (_event, options: { code: string }) => {
    const result = await joinOrganizationWithCode(options.code);
    await syncOrgSecrets().catch((err) => {
      console.warn("[org-secrets] post-join sync failed", err);
    });
    return result;
  });
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
  ipcMain.handle(
    "harness:updateOrganization",
    async (
      _event,
      options: { name?: string; cloudWorkersEnabled?: boolean },
    ) => updateOrganization(options),
  );

  ipcMain.handle("harness:getOrgSecrets", async () => fetchOrgSecrets());
  ipcMain.handle(
    "harness:upsertOrgSecret",
    async (_event, options: { slot: string; value: string }) => {
      const result = await upsertOrgSecret(options.slot, options.value);
      await syncOrgSecrets();
      return result;
    },
  );
  ipcMain.handle("harness:deleteOrgSecret", async (_event, options: { slot: string }) => {
    const result = await deleteOrgSecret(options.slot);
    await syncOrgSecrets();
    return result;
  });
  ipcMain.handle("harness:syncOrgSecrets", async () => syncOrgSecrets());
  ipcMain.handle("harness:getOrgManagedSecretSlots", () => getActiveOrgSecretSlots());

  ipcMain.handle("harness:listRepoEnvironments", async () => {
    try {
      return await listRepoEnvironments();
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      throw new Error(err instanceof Error ? err.message : "Failed to load environments");
    }
  });
  ipcMain.handle(
    "harness:listRepoEnvironmentVariables",
    async (_event, options: { connectionId: string }) => {
      try {
        return await listRepoEnvironmentVariables(options.connectionId);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to load environment variables");
      }
    },
  );
  ipcMain.handle(
    "harness:upsertRepoEnvironmentVariable",
    async (
      _event,
      options: {
        connectionId: string;
        key: string;
        value: string;
        isSecret: boolean;
        description?: string | null;
      },
    ) => {
      try {
        return await upsertRepoEnvironmentVariable(options);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to save environment variable");
      }
    },
  );
  ipcMain.handle(
    "harness:deleteRepoEnvironmentVariable",
    async (_event, options: { connectionId: string; key: string }) => {
      try {
        return await deleteRepoEnvironmentVariable(options);
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to delete environment variable");
      }
    },
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

  ipcMain.handle("harness:getLinearStatus", async () => {
    try {
      return await fetchLinearStatus();
    } catch (err) {
      console.error("[harness:getLinearStatus]", err);
      const message = err instanceof Error ? err.message : "Failed to load Linear status";
      return {
        configured: false,
        connected: false,
        installation: null,
        mappings: [],
        error: message,
      };
    }
  });

  ipcMain.handle("harness:openLinearConnect", async () => {
    const { url } = await fetchLinearConnectUrl();
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("harness:deleteLinearInstallation", async () => deleteLinearInstallation());
  ipcMain.handle("harness:listLinearMappings", async () => listLinearMappings());
  ipcMain.handle("harness:listLinearProjects", async () => listLinearProjects());
  ipcMain.handle(
    "harness:upsertLinearMapping",
    async (
      _event,
      options: {
        installationId: string;
        projectId: string;
        projectName: string;
        provider: string;
        namespace: string;
        repoName: string;
        projectSourceControlConnectionId?: string | null;
      },
    ) => upsertLinearMapping(options),
  );
  ipcMain.handle("harness:deleteLinearMapping", async (_event, options: { mappingId: string }) =>
    deleteLinearMapping(options.mappingId),
  );
  ipcMain.handle("harness:getLinearAgentConfigs", async () => fetchLinearAgentConfigs());
  ipcMain.handle("harness:getLinearAgentSessions", async () => fetchLinearAgentSessions());
  ipcMain.handle(
    "harness:upsertLinearAgentConfig",
    async (
      _event,
      options: {
        mappingId: string;
        enabled?: boolean;
        model?: string;
        instructions?: string;
        targetBranch?: string;
        tools?: import("./openharness-api.js").WorkflowTools;
      },
    ) => upsertLinearAgentConfig(options.mappingId, options),
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
    "harness:connectSourceControlRepo",
    async (
      _event,
      options: {
        provider: "github" | "azure_devops";
        projectPath: string;
        owner: string;
        repo: string;
        remoteUrl?: string | null;
      },
    ) => {
      return connectSourceControlProject({
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

  ipcMain.handle("harness:getWorkflowRun", async (_event, runId: string) => {
    try {
      return await getWorkflowRun(runId);
    } catch (err) {
      if (err instanceof OpenHarnessApiError) throw new Error(err.message);
      throw new Error(err instanceof Error ? err.message : "Failed to load workflow run");
    }
  });
  ipcMain.handle(
    "harness:listWorkflowRunEvents",
    async (_event, options: { runId: string; afterSeq?: number; limit?: number }) => {
      try {
        return await listWorkflowRunEvents(options.runId, {
          afterSeq: options.afterSeq,
          limit: options.limit,
        });
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to load workflow run events");
      }
    },
  );

  ipcMain.handle(
    "harness:dismissWorkflowRun",
    async (_event, options: { runId: string; reason?: string }) => {
      try {
        return await dismissWorkflowRun(options.runId, { reason: options.reason });
      } catch (err) {
        if (err instanceof OpenHarnessApiError) throw new Error(err.message);
        throw new Error(err instanceof Error ? err.message : "Failed to dismiss workflow run");
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

  ipcMain.handle("harness:syncWorkflowRuns", async () => {
    const runner = getWorkflowRunner();
    runner.setRendererReady(true);
    const reconciled = runner.isBusy() ? 0 : await runner.reconcileStaleRuns();
    return { ok: true, reconciled };
  });

  ipcMain.handle("harness:getAppVersion", () => app.getVersion());

  ipcMain.handle("harness:requestElectronAuth", async () => {
    await requestElectronAuth();
    await syncOrgSecrets().catch((err) => {
      console.warn("[org-secrets] post-auth sync failed", err);
    });
  });

  ipcMain.handle("harness:checkForUpdates", async () => {
    await checkForUpdates();
  });

  ipcMain.handle("harness:getUpdateStatus", () => getUpdateStatus());

  ipcMain.handle("harness:isUpdaterEnabled", () => isUpdaterEnabled());

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
  void syncOrgSecrets().catch((err) => {
    console.warn("[org-secrets] initial sync failed", err);
  });
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
