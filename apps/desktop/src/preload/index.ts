import { contextBridge, ipcRenderer } from "electron";
import type { HarnessAPI, HarnessEventEnvelope, UpdateStatus } from "./api.js";

const nativeVibrancyEnabled =
  process.platform === "darwin" &&
  process.env.OPENHARNESS_DISABLE_NATIVE_VIBRANCY !== "1";

const harness: HarnessAPI = {
  platform: process.platform,
  nativeVibrancyEnabled,
  pickDirectory: () => ipcRenderer.invoke("harness:pickDirectory"),
  getLastCwd: () => ipcRenderer.invoke("harness:getLastCwd"),
  listProjects: () => ipcRenderer.invoke("harness:listProjects"),
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
  setModel: (options) => ipcRenderer.invoke("harness:setModel", options),
  setThinkingLevel: (options) => ipcRenderer.invoke("harness:setThinkingLevel", options),
  setSwarmMode: (options) => ipcRenderer.invoke("harness:setSwarmMode", options),
  getStatus: () => ipcRenderer.invoke("harness:getStatus"),
  getSettings: () => ipcRenderer.invoke("harness:getSettings"),
  setSettings: (options) => ipcRenderer.invoke("harness:setSettings", options),
  listProjectsFromGlobalPi: () => ipcRenderer.invoke("harness:listProjectsFromGlobalPi"),
  listConversationsFromGlobalPi: (options) =>
    ipcRenderer.invoke("harness:listConversationsFromGlobalPi", options),
  getGitLineStats: (options) => ipcRenderer.invoke("harness:getGitLineStats", options),
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
};

contextBridge.exposeInMainWorld("harness", harness);
