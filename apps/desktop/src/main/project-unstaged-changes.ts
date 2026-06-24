import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

export type ProjectUnstagedChangeStatus = "modified" | "deleted" | "added" | "untracked";

export interface ProjectUnstagedChangeEntry {
  path: string;
  status: ProjectUnstagedChangeStatus;
}

export interface ProjectUnstagedChanges {
  files: ProjectUnstagedChangeEntry[];
  patch: string;
}

const EMPTY_CHANGES: ProjectUnstagedChanges = { files: [], patch: "" };

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

function parseNameStatusPath(rawPath: string): string {
  const renamedSeparator = "\t";
  if (rawPath.includes(" -> ")) {
    const parts = rawPath.split(" -> ");
    return (parts[parts.length - 1] ?? rawPath).trim();
  }
  const tabParts = rawPath.split(renamedSeparator);
  return (tabParts[tabParts.length - 1] ?? rawPath).trim();
}

function mapNameStatus(code: string): ProjectUnstagedChangeStatus {
  switch (code) {
    case "D":
      return "deleted";
    case "A":
      return "added";
    case "M":
    case "T":
    case "R":
    case "C":
    default:
      return "modified";
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout;
}

async function listUnstagedTrackedFiles(cwd: string): Promise<ProjectUnstagedChangeEntry[]> {
  try {
    const stdout = await runGit(cwd, ["diff", "--name-status"]);
    const files: ProjectUnstagedChangeEntry[] = [];

    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      const tabIndex = line.indexOf("\t");
      if (tabIndex === -1) continue;

      const code = line.slice(0, tabIndex).trim();
      const rawPath = line.slice(tabIndex + 1);
      const path = parseNameStatusPath(rawPath);
      if (!path) continue;

      const statusCode = code.length > 1 ? code[0]! : code;
      files.push({ path, status: mapNameStatus(statusCode) });
    }

    return files;
  } catch {
    return [];
  }
}

async function getTrackedUnstagedPatch(cwd: string): Promise<string> {
  try {
    return await runGit(cwd, ["diff", "--no-color"]);
  } catch {
    return "";
  }
}

export async function getProjectUnstagedChanges(cwd: string): Promise<ProjectUnstagedChanges> {
  if (!(await isGitRepo(cwd))) return EMPTY_CHANGES;

  try {
    const [files, patch] = await Promise.all([
      listUnstagedTrackedFiles(cwd),
      getTrackedUnstagedPatch(cwd),
    ]);

    if (files.length === 0) {
      return EMPTY_CHANGES;
    }

    return { files, patch: patch.trim() };
  } catch {
    return EMPTY_CHANGES;
  }
}
