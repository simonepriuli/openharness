import { setupRenderer } from "@better-auth/electron/preload";

setupRenderer();

import { contextBridge, ipcRenderer } from "electron";
import type {
  HarnessAPI,
  HarnessEventEnvelope,
  HarnessMenuAction,
  NewModelsNoticePayload,
  UpdateStatus,
  WorkflowConversationPayload,
} from "./api.js";

const nativeVibrancyEnabled =
  process.platform === "darwin" &&
  process.env.OPENHARNESS_DISABLE_NATIVE_VIBRANCY !== "1";

const harness: HarnessAPI = {
  platform: process.platform,
  nativeVibrancyEnabled,
  pickDirectory: () => ipcRenderer.invoke("harness:pickDirectory"),
  getLastCwd: () => ipcRenderer.invoke("harness:getLastCwd"),
  listProjects: () => ipcRenderer.invoke("harness:listProjects"),
  removeProject: (options) => ipcRenderer.invoke("harness:removeProject", options),
  listConversations: (options) => ipcRenderer.invoke("harness:listConversations", options),
  searchFiles: (options) => ipcRenderer.invoke("harness:searchFiles", options),
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
  getStatus: () => ipcRenderer.invoke("harness:getStatus"),
  getSettings: () => ipcRenderer.invoke("harness:getSettings"),
  refreshCredits: () => ipcRenderer.invoke("harness:refreshCredits"),
  setSettings: (options) => ipcRenderer.invoke("harness:setSettings", options),
  listProjectsFromGlobalPi: () => ipcRenderer.invoke("harness:listProjectsFromGlobalPi"),
  listConversationsFromGlobalPi: (options) =>
    ipcRenderer.invoke("harness:listConversationsFromGlobalPi", options),
  generateTitle: (options) => ipcRenderer.invoke("harness:generateTitle", options),
  getGitLineStats: (options) => ipcRenderer.invoke("harness:getGitLineStats", options),
  getGithubStatus: () => ipcRenderer.invoke("harness:getGithubStatus"),
  getGithubInstallUrl: () => ipcRenderer.invoke("harness:getGithubInstallUrl"),
  openGithubInstall: () => ipcRenderer.invoke("harness:openGithubInstall"),
  getSessionDiagnostics: () => ipcRenderer.invoke("harness:getSessionDiagnostics"),
  getGitRemoteInfo: (options) => ipcRenderer.invoke("harness:getGitRemoteInfo", options),
  getGithubConnection: (options) => ipcRenderer.invoke("harness:getGithubConnection", options),
  connectGithubRepo: (options) => ipcRenderer.invoke("harness:connectGithubRepo", options),
  disconnectGithubRepo: (options) => ipcRenderer.invoke("harness:disconnectGithubRepo", options),
  listGithubRepos: (options) => ipcRenderer.invoke("harness:listGithubRepos", options),
  getWorkflowSettings: () => ipcRenderer.invoke("harness:getWorkflowSettings"),
  createWorkflow: (options) => ipcRenderer.invoke("harness:createWorkflow", options),
  onWorkflowConversation: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkflowConversationPayload) => {
      callback(data);
    };
    ipcRenderer.on("harness:workflow-conversation", listener);
    return () => {
      ipcRenderer.removeListener("harness:workflow-conversation", listener);
    };
  },
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
