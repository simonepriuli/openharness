import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, normalize, relative, resolve } from "node:path";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveGrantedPath } from "../shared/path-grants.js";

export type OfficeFileKind = "docx" | "xlsx";

export type ResolvedOfficeFilePath = {
  absolutePath: string;
  kind: OfficeFileKind;
  /** Path key used in office tabs and UI (relative or absolute). */
  pathKey: string;
};

const OFFICE_EXTENSIONS: Record<string, OfficeFileKind> = {
  ".docx": "docx",
  ".xlsx": "xlsx",
};

export function officeFileKindFromPath(filePath: string): OfficeFileKind | null {
  const lower = filePath.trim().toLowerCase();
  for (const [extension, kind] of Object.entries(OFFICE_EXTENSIONS)) {
    if (lower.endsWith(extension)) {
      return kind;
    }
  }
  return null;
}

export function resolveOfficeFilePath(
  cwd: string,
  filePath: string,
  grants: AttachedRoot[] = [],
): ResolvedOfficeFilePath | null {
  const trimmed = filePath.trim();
  const kind = officeFileKindFromPath(trimmed);
  if (!kind) {
    return null;
  }

  const granted = resolveGrantedPath(cwd, grants, trimmed);
  if (!granted) {
    return null;
  }

  if (officeFileKindFromPath(granted.absolutePath) !== kind) {
    return null;
  }

  const pathKey = isAbsolute(trimmed)
    ? normalize(granted.absolutePath).replace(/\\/g, "/")
    : granted.displayPath.replace(/\\/g, "/");

  return {
    absolutePath: granted.absolutePath,
    kind,
    pathKey,
  };
}

export function resolveOfficeRelativePath(
  cwd: string,
  filePath: string,
  grants: AttachedRoot[] = [],
): { absolutePath: string; relativePath: string; kind: OfficeFileKind } | null {
  const resolved = resolveOfficeFilePath(cwd, filePath, grants);
  if (!resolved) return null;

  const resolvedCwd = resolve(cwd);
  const normalizedCwd = existsSync(resolvedCwd) ? realpathSync(resolvedCwd) : resolvedCwd;
  const rel = relative(normalizedCwd, resolved.absolutePath);
  const relativePath =
    rel && !rel.startsWith("..") ? normalize(rel).replace(/\\/g, "/") : resolved.pathKey;

  return {
    absolutePath: resolved.absolutePath,
    relativePath,
    kind: resolved.kind,
  };
}

export async function readOfficeFileAtPath(
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

export function officeDisplayName(filePath: string): string {
  return basename(filePath.replace(/\\/g, "/"));
}
