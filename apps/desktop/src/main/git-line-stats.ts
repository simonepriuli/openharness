import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ToolLineStats } from "../shared/tool-line-stats.js";

const execFileAsync = promisify(execFile);

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

function parseNumstat(stdout: string, filePath: string): ToolLineStats | undefined {
  const basename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  for (const line of stdout.trim().split("\n")) {
    if (!line.trim()) continue;
    const [added, removed, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (!path) continue;
    const pathBase = path.replace(/\\/g, "/").split("/").pop() ?? path;
    if (path !== filePath && pathBase !== basename && !path.endsWith(`/${filePath}`)) {
      continue;
    }
    return {
      linesAdded: Number.parseInt(added ?? "0", 10) || 0,
      linesRemoved: Number.parseInt(removed ?? "0", 10) || 0,
    };
  }
  return undefined;
}

async function countLinesOnDisk(cwd: string, filePath: string): Promise<number> {
  try {
    const content = await readFile(join(cwd, filePath), "utf8");
    if (!content) return 0;
    return content.replace(/\r\n/g, "\n").split("\n").length;
  } catch {
    return 0;
  }
}

/** Line counts from git for a single file after a tool mutates it. */
export async function gitLineStatsForFile(
  cwd: string,
  filePath: string,
): Promise<ToolLineStats | undefined> {
  if (!(await isGitRepo(cwd))) return undefined;

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "HEAD", "--", filePath],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const fromHead = parseNumstat(stdout, filePath);
    if (fromHead && (fromHead.linesAdded > 0 || fromHead.linesRemoved > 0)) {
      return fromHead;
    }
  } catch {
    // ignore — try working tree diff next
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "--", filePath],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const fromWorktree = parseNumstat(stdout, filePath);
    if (fromWorktree && (fromWorktree.linesAdded > 0 || fromWorktree.linesRemoved > 0)) {
      return fromWorktree;
    }
  } catch {
    // ignore
  }

  try {
    const { stdout: status } = await execFileAsync(
      "git",
      ["status", "--porcelain", "--", filePath],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const statusLine = status.trim().split("\n")[0] ?? "";
    if (statusLine.startsWith("??")) {
      const lines = await countLinesOnDisk(cwd, filePath);
      if (lines > 0) {
        return { linesAdded: lines, linesRemoved: 0, isCreate: true };
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}
