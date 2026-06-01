import { contextBridge, ipcRenderer } from "electron";
import type { HarnessAPI } from "./api.js";

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
  newSession: () => ipcRenderer.invoke("harness:newSession"),
  getMessages: () => ipcRenderer.invoke("harness:getMessages"),
  stop: () => ipcRenderer.invoke("harness:stop"),
  prompt: (options) => ipcRenderer.invoke("harness:prompt", options),
  abort: () => ipcRenderer.invoke("harness:abort"),
  getState: () => ipcRenderer.invoke("harness:getState"),
  getSessionStats: () => ipcRenderer.invoke("harness:getSessionStats"),
  getStatus: () => ipcRenderer.invoke("harness:getStatus"),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on("harness:event", listener);
    return () => {
      ipcRenderer.removeListener("harness:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("harness", harness);
