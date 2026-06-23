import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProjectGitStatus = "added" | "deleted" | "ignored" | "modified" | "renamed" | "untracked";

export interface ProjectGitStatusEntry {
  path: string;
  status: ProjectGitStatus;
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

function parsePorcelainPath(rawPath: string): string {
  const renamedSeparator = " -> ";
  if (rawPath.includes(renamedSeparator)) {
    const parts = rawPath.split(renamedSeparator);
    return (parts[parts.length - 1] ?? rawPath).trim();
  }
  return rawPath.trim();
}

function resolveGitStatus(staged: string, unstaged: string): ProjectGitStatus | null {
  const codes = `${staged}${unstaged}`;

  if (codes === "!!") return "ignored";
  if (staged === "?" && unstaged === "?") return "untracked";
  if (codes.includes("D")) return "deleted";
  if (staged === "A" || unstaged === "A") return "added";
  if (staged === "R" || unstaged === "R") return "renamed";
  if (codes.includes("M") || codes.includes("T")) return "modified";

  return null;
}

export async function getProjectGitStatus(cwd: string): Promise<ProjectGitStatusEntry[]> {
  if (!(await isGitRepo(cwd))) return [];

  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-u"], {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
    });

    const entries: ProjectGitStatusEntry[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;

      const staged = line[0] ?? " ";
      const unstaged = line[1] ?? " ";
      const rawPath = line.slice(3);
      const path = parsePorcelainPath(rawPath);
      if (!path) continue;

      const status = resolveGitStatus(staged, unstaged);
      if (status) {
        entries.push({ path, status });
      }
    }

    return entries;
  } catch {
    return [];
  }
}
