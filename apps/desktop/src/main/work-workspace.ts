import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const WORK_WORKSPACE_DIR_NAME = "work-workspace";

export function getWorkWorkspacePath(): string {
  return join(app.getPath("userData"), WORK_WORKSPACE_DIR_NAME);
}

export function isWorkWorkspaceCwd(cwd: string): boolean {
  const normalized = cwd.replace(/\\/g, "/");
  return normalized.endsWith(`/${WORK_WORKSPACE_DIR_NAME}`);
}

export function ensureWorkWorkspace(): string {
  const cwd = getWorkWorkspacePath();
  mkdirSync(cwd, { recursive: true });
  return cwd;
}
