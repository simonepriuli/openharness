import fg from "fast-glob";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AttachedRoot } from "../shared/path-grants.js";
import { isPathWithinCwd } from "../shared/path-grants.js";

export interface ProjectFile {
  relativePath: string;
  absolutePath?: string;
  rootLabel?: string;
}

export type SearchRoot = {
  cwd: string;
  rootLabel?: string;
  grants?: AttachedRoot[];
};

let cachedCwd: string | null = null;
let cachedFiles: string[] | null = null;
let indexPromise: Promise<string[]> | null = null;

const multiRootCache = new Map<string, string[]>();
const multiRootPromises = new Map<string, Promise<string[]>>();

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

export async function listProjectFiles(cwd: string): Promise<string[]> {
  return indexProjectFiles(cwd);
}

export async function searchProjectFiles(
  cwd: string,
  query: string,
  limit = 20,
): Promise<ProjectFile[]> {
  return searchFilesAcrossRoots([{ cwd }], query, limit);
}

function cacheKeyForRoot(root: SearchRoot): string {
  const grantKey = (root.grants ?? [])
    .map((grant) => `${grant.kind}:${grant.absolutePath}`)
    .sort()
    .join("|");
  return `${root.cwd}::${root.rootLabel ?? ""}::${grantKey}`;
}

async function indexSearchRoot(root: SearchRoot): Promise<string[]> {
  const key = cacheKeyForRoot(root);
  const cached = multiRootCache.get(key);
  if (cached) return cached;

  const existingPromise = multiRootPromises.get(key);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const files: string[] = [];
    const cwdFiles = await indexProjectFiles(root.cwd);
    for (const filePath of cwdFiles) {
      files.push(filePath);
    }

    for (const grant of root.grants ?? []) {
      if (grant.kind !== "folder") continue;
      if (isPathWithinCwd(root.cwd, grant.absolutePath)) continue;
      if (!existsSync(grant.absolutePath)) continue;
      const grantFiles = await fg("**/*", {
        cwd: grant.absolutePath,
        onlyFiles: true,
        dot: false,
        suppressErrors: true,
        ignore: EXTRA_IGNORE,
      });
      for (const filePath of grantFiles) {
        const absolutePath = resolve(grant.absolutePath, filePath);
        const displayPath = `${grant.label}/${filePath.replace(/\\/g, "/")}`;
        files.push(`\0${displayPath}\0${absolutePath}`);
      }
    }

    multiRootCache.set(key, files);
    multiRootPromises.delete(key);
    return files;
  })().catch((err) => {
    multiRootPromises.delete(key);
    throw err;
  });

  multiRootPromises.set(key, promise);
  return promise;
}

function decodeIndexedPath(entry: string): { displayPath: string; absolutePath?: string } {
  if (entry.includes("\0")) {
    const [, displayPath = "", absolutePath = ""] = entry.split("\0");
    return { displayPath, absolutePath: absolutePath || undefined };
  }
  return { displayPath: entry };
}

export async function searchFilesAcrossRoots(
  roots: SearchRoot[],
  query: string,
  limit = 20,
): Promise<ProjectFile[]> {
  const merged: ProjectFile[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (cachedCwd === root.cwd && cachedFiles && !root.grants?.length) {
      const ranked = rankFiles(cachedFiles, query, limit);
      for (const file of ranked) {
        const key = file.relativePath;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          relativePath: file.relativePath,
          ...(root.rootLabel ? { rootLabel: root.rootLabel } : {}),
        });
      }
      continue;
    }

    if (!root.grants?.length) {
      const quickFiles = await globFiles(root.cwd, QUICK_DEPTH);
      const quickSorted = [...quickFiles].sort((a, b) => a.localeCompare(b));
      const quickResults = rankFiles(quickSorted, query, limit);
      for (const file of quickResults) {
        if (seen.has(file.relativePath)) continue;
        seen.add(file.relativePath);
        merged.push({
          relativePath: file.relativePath,
          ...(root.rootLabel ? { rootLabel: root.rootLabel } : {}),
        });
      }
      if (!indexPromise || cachedCwd !== root.cwd) {
        warmFileIndex(root.cwd);
      }
      continue;
    }

    const indexed = await indexSearchRoot(root);
    const ranked = indexed
      .map((entry) => {
        const decoded = decodeIndexedPath(entry);
        return {
          relativePath: decoded.displayPath,
          absolutePath: decoded.absolutePath,
          score: scoreMatch(decoded.displayPath, query),
        };
      })
      .filter((entry) => entry.score > 0 || !query.trim())
      .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));

    for (const file of ranked) {
      const key = file.absolutePath ?? file.relativePath;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        relativePath: file.relativePath,
        ...(file.absolutePath ? { absolutePath: file.absolutePath } : {}),
        ...(root.rootLabel ? { rootLabel: root.rootLabel } : {}),
      });
      if (merged.length >= limit) break;
    }
  }

  if (!query.trim()) {
    return merged.slice(0, limit);
  }

  return merged
    .map((file) => ({
      file,
      score: scoreMatch(file.relativePath, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.relativePath.localeCompare(b.file.relativePath))
    .slice(0, limit)
    .map((entry) => entry.file);
}
