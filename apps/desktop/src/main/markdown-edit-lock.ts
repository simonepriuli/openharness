import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalize } from "node:path";

const locksBySession = new Map<string, Set<string>>();

function normalizePath(filePath: string): string {
  return normalize(filePath).replace(/\\/g, "/");
}

function lockFilePathForSession(sessionKey: string): string {
  const hash = createHash("sha256").update(sessionKey).digest("hex").slice(0, 16);
  const dir = join(tmpdir(), "openharness-markdown-locks");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${hash}.json`);
}

function getSessionLocks(sessionKey: string): Set<string> {
  let registry = locksBySession.get(sessionKey);
  if (!registry) {
    registry = new Set();
    locksBySession.set(sessionKey, registry);
  }
  return registry;
}

function syncLockFile(sessionKey: string): void {
  const lockedPaths = [...getSessionLocks(sessionKey)];
  const lockFile = lockFilePathForSession(sessionKey);
  writeFileSync(lockFile, JSON.stringify({ lockedPaths }), "utf8");
}

export function getMarkdownLocksFileForSession(sessionKey: string): string {
  return lockFilePathForSession(sessionKey);
}

export function setMarkdownEditLock(
  sessionKey: string,
  relativePath: string,
  locked: boolean,
): { ok: true } {
  const normalizedSession = sessionKey.trim();
  const normalizedPath = normalizePath(relativePath);
  if (!normalizedSession || !normalizedPath) {
    return { ok: true };
  }

  const registry = getSessionLocks(normalizedSession);
  if (locked) {
    registry.add(normalizedPath);
  } else {
    registry.delete(normalizedPath);
  }

  if (registry.size === 0) {
    locksBySession.delete(normalizedSession);
    writeFileSync(lockFilePathForSession(normalizedSession), JSON.stringify({ lockedPaths: [] }), "utf8");
    return { ok: true };
  }

  syncLockFile(normalizedSession);
  return { ok: true };
}

export function getMarkdownEditLocks(sessionKey: string): string[] {
  const registry = locksBySession.get(sessionKey.trim());
  if (!registry) return [];
  return [...registry];
}

export function isMarkdownPathLocked(sessionKey: string, filePath: string): boolean {
  const registry = locksBySession.get(sessionKey.trim());
  if (!registry) return false;
  return registry.has(normalizePath(filePath));
}

export function clearMarkdownEditLocks(sessionKey: string): void {
  locksBySession.delete(sessionKey.trim());
  writeFileSync(
    lockFilePathForSession(sessionKey.trim()),
    JSON.stringify({ lockedPaths: [] }),
    "utf8",
  );
}
