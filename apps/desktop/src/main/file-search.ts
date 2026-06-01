import fg from "fast-glob";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ProjectFile {
  relativePath: string;
}

let cachedCwd: string | null = null;
let cachedFiles: string[] | null = null;
let indexPromise: Promise<string[]> | null = null;

const EXTRA_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/out/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/.pnpm/**",
];

const INDEX_TIMEOUT_MS = 60_000;
const QUICK_DEPTH = 6;

export function clearFileIndex(): void {
  cachedCwd = null;
  cachedFiles = null;
  indexPromise = null;
}

export function warmFileIndex(cwd: string): void {
  void indexProjectFiles(cwd).catch((err) => {
    console.error("[file-search] index failed:", err);
    if (cachedCwd === cwd) {
      indexPromise = null;
    }
  });
}

async function loadGitignorePatterns(cwd: string): Promise<string[]> {
  const path = join(cwd, ".gitignore");
  if (!existsSync(path)) return [];
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.includes("!"))
      .map((line) => {
        const normalized = line.replace(/^\//, "");
        return normalized.endsWith("/") ? `${normalized}**` : normalized;
      });
  } catch {
    return [];
  }
}

async function globFiles(cwd: string, deep: number): Promise<string[]> {
  const gitignore = await loadGitignorePatterns(cwd);
  return fg(["**/*"], {
    cwd,
    onlyFiles: true,
    dot: false,
    deep,
    suppressErrors: true,
    ignore: [...EXTRA_IGNORE, ...gitignore],
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function indexProjectFiles(cwd: string): Promise<string[]> {
  if (cachedCwd === cwd && cachedFiles) {
    return cachedFiles;
  }

  if (cachedCwd === cwd && indexPromise) {
    return indexPromise;
  }

  cachedCwd = cwd;
  cachedFiles = null;

  indexPromise = withTimeout(
    (async () => {
      const files = await globFiles(cwd, 20);
      const sorted = [...files].sort((a, b) => a.localeCompare(b));
      cachedFiles = sorted;
      return sorted;
    })(),
    INDEX_TIMEOUT_MS,
    "file index",
  ).catch((err) => {
    indexPromise = null;
    throw err;
  });

  return indexPromise;
}

function scoreMatch(path: string, query: string): number {
  const lower = path.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;

  const base = path.split("/").pop()?.toLowerCase() ?? lower;
  if (base === q) return 100;
  if (base.startsWith(q)) return 80;
  if (base.includes(q)) return 60;
  if (lower.includes(q)) return 40;
  return 0;
}

function rankFiles(files: string[], query: string, limit: number): ProjectFile[] {
  const q = query.trim();
  if (!q) {
    return files.slice(0, limit).map((relativePath) => ({ relativePath }));
  }

  return files
    .map((relativePath) => ({ relativePath, score: scoreMatch(relativePath, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, limit)
    .map(({ relativePath }) => ({ relativePath }));
}

export async function searchProjectFiles(
  cwd: string,
  query: string,
  limit = 20,
): Promise<ProjectFile[]> {
  if (cachedCwd === cwd && cachedFiles) {
    return rankFiles(cachedFiles, query, limit);
  }

  // Fast partial results while the full index builds.
  const quickFiles = await globFiles(cwd, QUICK_DEPTH);
  const quickSorted = [...quickFiles].sort((a, b) => a.localeCompare(b));
  const quickResults = rankFiles(quickSorted, query, limit);

  if (!indexPromise || cachedCwd !== cwd) {
    warmFileIndex(cwd);
  }

  return quickResults;
}
