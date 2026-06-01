import { app } from "electron";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { appStore } from "./store.js";

/** Pi agent dir when using the global CLI profile (`~/.pi/agent`). */
export const GLOBAL_PI_AGENT_DIR = path.join(homedir(), ".pi", "agent");

export function useGlobalPiConfig(): boolean {
  return appStore.get("useGlobalPiConfig") === true;
}

export function setUseGlobalPiConfig(value: boolean): void {
  appStore.set("useGlobalPiConfig", value);
}

export function getPiAgentDir(): string {
  if (useGlobalPiConfig()) {
    return GLOBAL_PI_AGENT_DIR;
  }
  return path.join(app.getPath("userData"), "pi", "agent");
}

export function getPiSessionsRoot(): string {
  return path.join(getPiAgentDir(), "sessions");
}

export function getGlobalPiSessionsRoot(): string {
  return path.join(GLOBAL_PI_AGENT_DIR, "sessions");
}

export function ensurePiAgentDir(): void {
  const agentDir = getPiAgentDir();
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(path.join(agentDir, "sessions"), { recursive: true });
}
