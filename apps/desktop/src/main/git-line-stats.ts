import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import type { ToolLineStats } from "../shared/tool-line-stats.js";

/** Normalize UI or absolute paths to a repo-relative path for git. */
export function normalizeGitFilePath(cwd: string, filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) return normalized;

  if (normalized.startsWith("~/")) {
    normalized = join(homedir(), normalized.slice(2)).replace(/\\/g, "/");
  }

  const cwdNormalized = cwd.replace(/\\/g, "/");
  if (isAbsolute(normalized)) {
    if (normalized === cwdNormalized || normalized.startsWith(`${cwdNormalized}/`)) {
      return relative(cwdNormalized, normalized).replace(/\\/g, "/");
    }
    return normalized;
  }

  return normalized;
}

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

  const gitPath = normalizeGitFilePath(cwd, filePath);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "HEAD", "--", gitPath],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const fromHead = parseNumstat(stdout, gitPath);
    if (fromHead && (fromHead.linesAdded > 0 || fromHead.linesRemoved > 0)) {
      return fromHead;
    }
  } catch {
    // ignore — try working tree diff next
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", "--", gitPath],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const fromWorktree = parseNumstat(stdout, gitPath);
    if (fromWorktree && (fromWorktree.linesAdded > 0 || fromWorktree.linesRemoved > 0)) {
      return fromWorktree;
    }
  } catch {
    // ignore
  }

  try {
    const { stdout: status } = await execFileAsync(
      "git",
      ["status", "--porcelain", "--", gitPath],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const statusLine = status.trim().split("\n")[0] ?? "";
    if (statusLine.startsWith("??")) {
      const lines = await countLinesOnDisk(cwd, gitPath);
      if (lines > 0) {
        return { linesAdded: lines, linesRemoved: 0, isCreate: true };
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}

export interface GitLineStatsAggregate {
  files: number;
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Aggregate line stats for a set of files relative to HEAD + working tree.
 * When `filePaths` is omitted, stats are computed for the whole repo.
 * An empty `filePaths` array returns zeroed stats (thread with no edits).
 */
export async function gitLineStatsForFiles(
  cwd: string,
  filePaths?: string[],
): Promise<GitLineStatsAggregate | undefined> {
  if (!(await isGitRepo(cwd))) return undefined;

  const aggregate: GitLineStatsAggregate = {
    files: 0,
    linesAdded: 0,
    linesRemoved: 0,
  };

  if (filePaths) {
    if (filePaths.length === 0) return aggregate;

    for (const filePath of [...new Set(filePaths)]) {
      const stats = await gitLineStatsForFile(cwd, filePath);
      if (!stats) continue;
      aggregate.files += 1;
      aggregate.linesAdded += stats.linesAdded;
      aggregate.linesRemoved += stats.linesRemoved;
    }
    return aggregate;
  }

  // Whole-repo diff against HEAD (staged + unstaged).
  const stdout = await runGitDiffNumstat(cwd, ["diff", "--numstat", "HEAD"]);
  if (stdout === undefined) return aggregate;

  for (const line of stdout.trim().split("\n")) {
    if (!line.trim()) continue;
    const [added, removed] = line.split("\t");
    const addedCount = Number.parseInt(added ?? "0", 10) || 0;
    const removedCount = Number.parseInt(removed ?? "0", 10) || 0;
    if (addedCount === 0 && removedCount === 0) continue;
    aggregate.files += 1;
    aggregate.linesAdded += addedCount;
    aggregate.linesRemoved += removedCount;
  }

  // Untracked files: count whole-file lines as additions.
  try {
    const { stdout: statusStdout } = await execFileAsync(
      "git",
      ["status", "--porcelain", "-u"],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    for (const line of statusStdout.trim().split("\n")) {
      if (!line.startsWith("??")) continue;
      const filePath = line.slice(3).trim();
      if (!filePath) continue;
      const lines = await countLinesOnDisk(cwd, filePath);
      if (lines <= 0) continue;
      aggregate.files += 1;
      aggregate.linesAdded += lines;
    }
  } catch {
    // ignore
  }

  return aggregate;
}

async function runGitDiffNumstat(
  cwd: string,
  args: string[],
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return undefined;
  }
}
