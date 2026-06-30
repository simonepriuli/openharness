import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

function normalizePathForCompare(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, "/");
}

function normalizeExistingPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function readLockedMarkdownPaths(): string[] {
  const filePath = process.env.OPENHARNESS_MARKDOWN_LOCKS_FILE?.trim();
  if (!filePath) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { lockedPaths?: unknown };
    if (!Array.isArray(parsed.lockedPaths)) return [];
    return parsed.lockedPaths.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function pathCandidates(cwd: string, filePath: string): string[] {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  if (!trimmed) return [];

  const candidates = new Set<string>();
  candidates.add(normalizePathForCompare(trimmed));

  const resolved = path.isAbsolute(trimmed)
    ? normalizeExistingPath(trimmed)
    : normalizeExistingPath(path.resolve(cwd, trimmed));
  candidates.add(normalizePathForCompare(resolved));

  const relative = path.relative(cwd, resolved);
  if (relative && !relative.startsWith("..")) {
    candidates.add(normalizePathForCompare(relative));
  }

  return [...candidates];
}

export function isMarkdownExtension(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".md";
}

export function isMarkdownPathLocked(cwd: string, filePath: string): boolean {
  const lockedPaths = readLockedMarkdownPaths();
  if (lockedPaths.length === 0) return false;

  const locked = new Set(lockedPaths.map((entry) => normalizePathForCompare(entry)));
  return pathCandidates(cwd, filePath).some((candidate) => locked.has(candidate));
}

export function markdownPathFromToolInput(_cwd: string, input: unknown): string | undefined {
  const record = input as { path?: string; file_path?: string };
  const raw = String(record.path ?? record.file_path ?? "").trim();
  if (!raw || !isMarkdownExtension(raw)) return undefined;
  return raw;
}
