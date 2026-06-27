import type { AppWorkMode } from "../../../preload/api";

export type LandingProjectContext = "coding" | "work" | "work-project";

export type LastUsedProject = {
  cwd: string;
  context: LandingProjectContext;
  workMode: AppWorkMode;
};

export type LandingTarget = {
  cwd: string;
  context: LandingProjectContext;
};

export type LandingSession = {
  clientId: string;
  sessionKey: string;
  cwd: string;
  context: LandingProjectContext;
  status: "connecting" | "connected" | "error";
  error?: string | null;
};

const STORAGE_KEY = "openharness:last-used-project";

export function readLastUsedProject(): LastUsedProject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUsedProject;
    if (
      typeof parsed.cwd !== "string" ||
      (parsed.context !== "coding" &&
        parsed.context !== "work" &&
        parsed.context !== "work-project") ||
      (parsed.workMode !== "coding" && parsed.workMode !== "everyday")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastUsedProject(value: LastUsedProject): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode errors.
  }
}
