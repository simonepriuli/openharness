import { contextBridge, ipcRenderer } from "electron";
import type { HarnessAPI, HarnessEventEnvelope } from "./api.js";

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
  getState: (options) => ipcRenderer.invoke("harness:getState", options),
  getSessionStats: (options) => ipcRenderer.invoke("harness:getSessionStats", options),
  getStatus: () => ipcRenderer.invoke("harness:getStatus"),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: HarnessEventEnvelope) => {
      callback(data);
    };
    ipcRenderer.on("harness:event", listener);
    return () => {
      ipcRenderer.removeListener("harness:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("harness", harness);
