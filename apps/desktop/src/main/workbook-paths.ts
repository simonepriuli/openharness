import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, normalize, relative, resolve } from "node:path";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveGrantedPath } from "../shared/path-grants.js";

export type ResolvedWorkbookPath = {
  absolutePath: string;
  /** Path key used in workbook tabs and UI (relative or absolute). */
  pathKey: string;
};

export function resolveWorkbookPath(
  cwd: string,
  filePath: string,
  grants: AttachedRoot[] = [],
): ResolvedWorkbookPath | null {
  const trimmed = filePath.trim();
  if (!trimmed.toLowerCase().endsWith(".xlsx")) {
    return null;
  }

  const granted = resolveGrantedPath(cwd, grants, trimmed);
  if (!granted) {
    return null;
  }

  if (!granted.absolutePath.toLowerCase().endsWith(".xlsx")) {
    return null;
  }

  const pathKey = isAbsolute(trimmed)
    ? normalize(granted.absolutePath).replace(/\\/g, "/")
    : granted.displayPath.replace(/\\/g, "/");

  return {
    absolutePath: granted.absolutePath,
    pathKey,
  };
}

export function resolveWorkbookRelativePath(
  cwd: string,
  filePath: string,
  grants: AttachedRoot[] = [],
): { absolutePath: string; relativePath: string } | null {
  const resolved = resolveWorkbookPath(cwd, filePath, grants);
  if (!resolved) return null;

  const resolvedCwd = resolve(cwd);
  const normalizedCwd = existsSync(resolvedCwd) ? realpathSync(resolvedCwd) : resolvedCwd;
  const rel = relative(normalizedCwd, resolved.absolutePath);
  const relativePath =
    rel && !rel.startsWith("..") ? normalize(rel).replace(/\\/g, "/") : resolved.pathKey;

  return {
    absolutePath: resolved.absolutePath,
    relativePath,
  };
}

export async function readWorkbookFileAtPath(
  absolutePath: string,
  pathKey: string,
): Promise<
  | { ok: true; relativePath: string; mtimeMs: number; base64: string }
  | { ok: false; relativePath: string; error: "not_found" | "too_large" | "directory" }
> {
  try {
    const fileStat = statSync(absolutePath);
    if (fileStat.isDirectory()) {
      return { ok: false, relativePath: pathKey, error: "directory" };
    }
    if (fileStat.size > 25 * 1024 * 1024) {
      return { ok: false, relativePath: pathKey, error: "too_large" };
    }

    const { readFileSync } = await import("node:fs");
    const buffer = readFileSync(absolutePath);
    return {
      ok: true,
      relativePath: pathKey,
      mtimeMs: fileStat.mtimeMs,
      base64: buffer.toString("base64"),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return { ok: false, relativePath: pathKey, error: "not_found" };
    }
    throw err;
  }
}

export function workbookDisplayName(filePath: string): string {
  return basename(filePath.replace(/\\/g, "/"));
}
