import { setupRenderer } from "@better-auth/electron/preload";

setupRenderer();

import { contextBridge, ipcRenderer } from "electron";
import type {
  HarnessAPI,
  HarnessEventEnvelope,
  HarnessMenuAction,
  NewModelsNoticePayload,
  ProjectFileChangePayload,
  UpdateStatus,
  WorkbookChangePayload,
  WorkflowRunUpdatePayload,
} from "./api.js";

const nativeVibrancyEnabled =
  process.platform === "darwin" &&
  process.env.OPENHARNESS_DISABLE_NATIVE_VIBRANCY !== "1";

const harness: HarnessAPI = {
  platform: process.platform,
  nativeVibrancyEnabled,
  pickDirectory: (options?: { skipOpenHarness?: boolean }) =>
    ipcRenderer.invoke("harness:pickDirectory", options),
  getWorkWorkspacePath: () => ipcRenderer.invoke("harness:getWorkWorkspacePath"),
  getLastCwd: () => ipcRenderer.invoke("harness:getLastCwd"),
  listProjects: () => ipcRenderer.invoke("harness:listProjects"),
  removeProject: (options) => ipcRenderer.invoke("harness:removeProject", options),
  listConversations: (options) => ipcRenderer.invoke("harness:listConversations", options),
  searchFiles: (options) => ipcRenderer.invoke("harness:searchFiles", options),
  listProjectFiles: (options) => ipcRenderer.invoke("harness:listProjectFiles", options),
  getProjectGitStatus: (options) => ipcRenderer.invoke("harness:getProjectGitStatus", options),
  getProjectUnstagedChanges: (options) =>
    ipcRenderer.invoke("harness:getProjectUnstagedChanges", options),
  readProjectFile: (options) => ipcRenderer.invoke("harness:readProjectFile", options),
  watchProjectFile: (options) => ipcRenderer.invoke("harness:watchProjectFile", options),
  unwatchProjectFile: () => ipcRenderer.invoke("harness:unwatchProjectFile"),
  onProjectFileChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ProjectFileChangePayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:project-file-changed", listener);
    return () => {
      ipcRenderer.removeListener("harness:project-file-changed", listener);
    };
  },
  readWorkbookFile: (options) => ipcRenderer.invoke("harness:readWorkbookFile", options),
  listWorkbookFiles: (options) => ipcRenderer.invoke("harness:listWorkbookFiles", options),
  watchWorkbookFile: (options) => ipcRenderer.invoke("harness:watchWorkbookFile", options),
  unwatchWorkbookFile: () => ipcRenderer.invoke("harness:unwatchWorkbookFile"),
  onWorkbookChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkbookChangePayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:workbook-changed", listener);
    return () => {
      ipcRenderer.removeListener("harness:workbook-changed", listener);
    };
  },
  listWorkbookOpenWithApps: () => ipcRenderer.invoke("harness:listWorkbookOpenWithApps"),
  openWorkbookWith: (options) => ipcRenderer.invoke("harness:openWorkbookWith", options),
  pickExternalPaths: (options) => ipcRenderer.invoke("harness:pickExternalPaths", options),
  setAttachedRoots: (options) => ipcRenderer.invoke("harness:setAttachedRoots", options),
  getSlashCommands: (options) => ipcRenderer.invoke("harness:getSlashCommands", options),
  getStaticSlashCommands: () => ipcRenderer.invoke("harness:getStaticSlashCommands"),
  start: (options) => ipcRenderer.invoke("harness:start", options),
  setActiveSession: (options) => ipcRenderer.invoke("harness:setActiveSession", options),
  newSession: (options) => ipcRenderer.invoke("harness:newSession", options),
  getMessages: (options) => ipcRenderer.invoke("harness:getMessages", options),
  stop: () => ipcRenderer.invoke("harness:stop"),
  prompt: (options) => ipcRenderer.invoke("harness:prompt", options),
  abort: (options) => ipcRenderer.invoke("harness:abort", options),
  respondExtensionUi: (options) => ipcRenderer.invoke("harness:respondExtensionUi", options),
  getState: (options) => ipcRenderer.invoke("harness:getState", options),
  getSessionStats: (options) => ipcRenderer.invoke("harness:getSessionStats", options),
  getAvailableModels: (options) => ipcRenderer.invoke("harness:getAvailableModels", options),
  getCloudProviders: () => ipcRenderer.invoke("harness:getCloudProviders"),
  setProviderApiKey: (options) => ipcRenderer.invoke("harness:setProviderApiKey", options),
  clearProviderApiKey: (options) => ipcRenderer.invoke("harness:clearProviderApiKey", options),
  setModel: (options) => ipcRenderer.invoke("harness:setModel", options),
  setThinkingLevel: (options) => ipcRenderer.invoke("harness:setThinkingLevel", options),
  setSwarmMode: (options) => ipcRenderer.invoke("harness:setSwarmMode", options),
  setPlanMode: (options) => ipcRenderer.invoke("harness:setPlanMode", options),
  getPlanFile: (options) => ipcRenderer.invoke("harness:getPlanFile", options),
  deletePlanFile: (options) => ipcRenderer.invoke("harness:deletePlanFile", options),
  getStatus: () => ipcRenderer.invoke("harness:getStatus"),
  getSettings: () => ipcRenderer.invoke("harness:getSettings"),
  refreshCredits: () => ipcRenderer.invoke("harness:refreshCredits"),
  setSettings: (options) => ipcRenderer.invoke("harness:setSettings", options),
  generateTitle: (options) => ipcRenderer.invoke("harness:generateTitle", options),
  getGitLineStats: (options) => ipcRenderer.invoke("harness:getGitLineStats", options),
  getGithubStatus: () => ipcRenderer.invoke("harness:getGithubStatus"),
  getAzureDevOpsStatus: () => ipcRenderer.invoke("harness:getAzureDevOpsStatus"),
  connectAzureDevOps: (options) => ipcRenderer.invoke("harness:connectAzureDevOps", options),
  disconnectAzureDevOps: () => ipcRenderer.invoke("harness:disconnectAzureDevOps"),
  getGithubInstallUrl: () => ipcRenderer.invoke("harness:getGithubInstallUrl"),
  openGithubInstall: () => ipcRenderer.invoke("harness:openGithubInstall"),
  getTeamsStatus: () => ipcRenderer.invoke("harness:getTeamsStatus"),
  openTeamsConnect: () => ipcRenderer.invoke("harness:openTeamsConnect"),
  listTeamsMappings: () => ipcRenderer.invoke("harness:listTeamsMappings"),
  listTeamsForUser: () => ipcRenderer.invoke("harness:listTeamsForUser"),
  listTeamsChannels: (options) => ipcRenderer.invoke("harness:listTeamsChannels", options),
  upsertTeamsMapping: (options) => ipcRenderer.invoke("harness:upsertTeamsMapping", options),
  deleteTeamsMapping: (options) => ipcRenderer.invoke("harness:deleteTeamsMapping", options),
  getDiscordStatus: () => ipcRenderer.invoke("harness:getDiscordStatus"),
  openDiscordConnect: () => ipcRenderer.invoke("harness:openDiscordConnect"),
  listDiscordMappings: () => ipcRenderer.invoke("harness:listDiscordMappings"),
  listDiscordGuilds: () => ipcRenderer.invoke("harness:listDiscordGuilds"),
  listDiscordChannels: (options) => ipcRenderer.invoke("harness:listDiscordChannels", options),
  upsertDiscordMapping: (options) => ipcRenderer.invoke("harness:upsertDiscordMapping", options),
  deleteDiscordMapping: (options) => ipcRenderer.invoke("harness:deleteDiscordMapping", options),
  getOrganization: () => ipcRenderer.invoke("harness:getOrganization"),
  listOrgMembers: () => ipcRenderer.invoke("harness:listOrgMembers"),
  getOrgCanManage: () => ipcRenderer.invoke("harness:getOrgCanManage"),
  getOrgOnboardingStatus: () => ipcRenderer.invoke("harness:getOrgOnboardingStatus"),
  createOrganization: (options) => ipcRenderer.invoke("harness:createOrganization", options),
  joinOrganizationWithCode: (options) =>
    ipcRenderer.invoke("harness:joinOrganizationWithCode", options),
  getOrgInviteCode: () => ipcRenderer.invoke("harness:getOrgInviteCode"),
  regenerateOrgInviteCode: () => ipcRenderer.invoke("harness:regenerateOrgInviteCode"),
  updateOrgMemberRole: (options) => ipcRenderer.invoke("harness:updateOrgMemberRole", options),
  removeOrgMember: (options) => ipcRenderer.invoke("harness:removeOrgMember", options),
  updateOrganization: (options) => ipcRenderer.invoke("harness:updateOrganization", options),
  getSessionDiagnostics: () => ipcRenderer.invoke("harness:getSessionDiagnostics"),
  getGitRemoteInfo: (options) => ipcRenderer.invoke("harness:getGitRemoteInfo", options),
  getGithubConnection: (options) => ipcRenderer.invoke("harness:getGithubConnection", options),
  connectGithubRepo: (options) => ipcRenderer.invoke("harness:connectGithubRepo", options),
  connectSourceControlRepo: (options) =>
    ipcRenderer.invoke("harness:connectSourceControlRepo", options),
  disconnectGithubRepo: (options) => ipcRenderer.invoke("harness:disconnectGithubRepo", options),
  listOrgGithubConnections: () => ipcRenderer.invoke("harness:listOrgGithubConnections"),
  listRunnerBindings: (options) => ipcRenderer.invoke("harness:listRunnerBindings", options),
  upsertRunnerBinding: (options) => ipcRenderer.invoke("harness:upsertRunnerBinding", options),
  getWorkflowRunnerInstanceId: () => ipcRenderer.invoke("harness:getWorkflowRunnerInstanceId"),
  listGithubRepos: (options) => ipcRenderer.invoke("harness:listGithubRepos", options),
  listAzureDevOpsRepos: (options) => ipcRenderer.invoke("harness:listAzureDevOpsRepos", options),
  listSourceControlRepos: (provider, options) =>
    ipcRenderer.invoke("harness:listSourceControlRepos", provider, options),
  listRepoBranches: (options) => ipcRenderer.invoke("harness:listRepoBranches", options),
  listWorkflows: () => ipcRenderer.invoke("harness:listWorkflows"),
  getWorkflow: (options) => ipcRenderer.invoke("harness:getWorkflow", options),
  createWorkflow: (options) => ipcRenderer.invoke("harness:createWorkflow", options),
  updateWorkflow: (options) => ipcRenderer.invoke("harness:updateWorkflow", options),
  deleteWorkflow: (options) => ipcRenderer.invoke("harness:deleteWorkflow", options),
  triggerWorkflowRun: (options) => ipcRenderer.invoke("harness:triggerWorkflowRun", options),
  listWorkflowRuns: (options) => ipcRenderer.invoke("harness:listWorkflowRuns", options),
  getWorkflowRun: (runId) => ipcRenderer.invoke("harness:getWorkflowRun", runId),
  dismissWorkflowRun: (options) => ipcRenderer.invoke("harness:dismissWorkflowRun", options),
  getWorkflowRunStats: (options) => ipcRenderer.invoke("harness:getWorkflowRunStats", options),
  getWorkflowSettings: () => ipcRenderer.invoke("harness:getWorkflowSettings"),
  onWorkflowRunUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkflowRunUpdatePayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:workflow-run-update", listener);
    return () => {
      ipcRenderer.removeListener("harness:workflow-run-update", listener);
    };
  },
  onWorkflowConversation: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkflowRunUpdatePayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:workflow-run-update", listener);
    return () => {
      ipcRenderer.removeListener("harness:workflow-run-update", listener);
    };
  },
  syncWorkflowRuns: () => ipcRenderer.invoke("harness:syncWorkflowRuns"),
  syncWorkflowConversations: () => ipcRenderer.invoke("harness:syncWorkflowRuns"),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: HarnessEventEnvelope) => {
      callback(data);
    };
    ipcRenderer.on("harness:event", listener);
    return () => {
      ipcRenderer.removeListener("harness:event", listener);
    };
  },
  getAppVersion: () => ipcRenderer.invoke("harness:getAppVersion"),
  requestElectronAuth: () => ipcRenderer.invoke("harness:requestElectronAuth"),
  checkForUpdates: () => ipcRenderer.invoke("harness:checkForUpdates"),
  getUpdateStatus: () => ipcRenderer.invoke("harness:getUpdateStatus"),
  isUpdaterEnabled: () => ipcRenderer.invoke("harness:isUpdaterEnabled"),
  installUpdate: () => ipcRenderer.invoke("harness:installUpdate"),
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdateStatus) => {
      callback(data);
    };
    ipcRenderer.on("harness:update-status", listener);
    return () => {
      ipcRenderer.removeListener("harness:update-status", listener);
    };
  },
  onNewModelsAvailable: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: NewModelsNoticePayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:new-models-available", listener);
    return () => {
      ipcRenderer.removeListener("harness:new-models-available", listener);
    };
  },
  dismissNewModelsNotice: (options) =>
    ipcRenderer.invoke("harness:dismissNewModelsNotice", options),
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: HarnessMenuAction) => {
      callback(data);
    };
    ipcRenderer.on("harness:menu-action", listener);
    return () => {
      ipcRenderer.removeListener("harness:menu-action", listener);
    };
  },
  getLocalProviders: () => ipcRenderer.invoke("harness:getLocalProviders"),
  setLocalProviders: (options) => ipcRenderer.invoke("harness:setLocalProviders", options),
  discoverLocalModels: (options) => ipcRenderer.invoke("harness:discoverLocalModels", options),
  testLocalConnection: (options) => ipcRenderer.invoke("harness:testLocalConnection", options),
};

contextBridge.exposeInMainWorld("harness", harness);
