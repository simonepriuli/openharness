import { existsSync, realpathSync } from "node:fs";
import { basename, isAbsolute, normalize, relative, resolve } from "node:path";
import type { AttachedRoot, AttachedRootKind } from "./attached-roots.js";

export type { AttachedRoot, AttachedRootKind } from "./attached-roots.js";
export { dedupeAttachedRoots, grantsToSessionPayload } from "./attached-roots.js";

export type ResolvedGrantedPath = {
  absolutePath: string;
  displayPath: string;
};

function normalizePathForCompare(filePath: string): string {
  return normalize(filePath).replace(/\\/g, "/");
}

function normalizeExistingPath(filePath: string): string {
  const resolved = resolve(filePath);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

/** True when `targetPath` is the same as or nested under `rootPath`. */
export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizePathForCompare(normalizeExistingPath(targetPath));
  const normalizedRoot = normalizePathForCompare(normalizeExistingPath(rootPath));

  if (normalizedTarget === normalizedRoot) {
    return true;
  }

  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedTarget.startsWith(prefix);
}

export function isPathWithinCwd(cwd: string, targetPath: string): boolean {
  const normalizedCwd = normalizeExistingPath(cwd);
  const absoluteTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(normalizedCwd, targetPath);
  const rel = relative(normalizedCwd, absoluteTarget);
  if (rel && !rel.startsWith("..") && rel !== "..") {
    return true;
  }

  const normalizedCwdCompare = normalizePathForCompare(normalizedCwd);
  const normalizedTargetCompare = normalizePathForCompare(
    existsSync(absoluteTarget) ? realpathSync(absoluteTarget) : absoluteTarget,
  );
  if (normalizedTargetCompare === normalizedCwdCompare) return true;
  const prefix = normalizedCwdCompare.endsWith("/") ? normalizedCwdCompare : `${normalizedCwdCompare}/`;
  return normalizedTargetCompare.startsWith(prefix);
}

function grantCoversPath(grant: AttachedRoot, absolutePath: string): boolean {
  if (grant.kind === "file") {
    return normalizePathForCompare(grant.absolutePath) === normalizePathForCompare(absolutePath);
  }
  return isPathWithinRoot(absolutePath, grant.absolutePath);
}

export function isPathGranted(cwd: string, grants: AttachedRoot[], targetPath: string): boolean {
  const absolutePath = resolve(targetPath);
  if (isPathWithinCwd(cwd, absolutePath)) {
    return true;
  }
  return grants.some((grant) => grantCoversPath(grant, absolutePath));
}

function displayPathForAbsolute(cwd: string, grants: AttachedRoot[], absolutePath: string): string {
  const normalizedCwd = normalizeExistingPath(cwd);

  if (isPathWithinCwd(cwd, absolutePath)) {
    const rel = relative(normalizedCwd, absolutePath).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..") && rel !== "..") {
      return rel;
    }
  }

  for (const grant of grants) {
    if (grant.kind === "folder" && isPathWithinRoot(absolutePath, grant.absolutePath)) {
      const rel = relative(grant.absolutePath, absolutePath).replace(/\\/g, "/");
      if (rel && !rel.startsWith("..")) {
        return `${grant.label}/${rel}`;
      }
    }
    if (grant.kind === "file" && grantCoversPath(grant, absolutePath)) {
      return grant.label;
    }
  }

  return normalizePathForCompare(absolutePath);
}

/**
 * Resolve a user/agent path against cwd and conversation grants.
 * Returns null when the path is not allowed.
 */
export function resolveGrantedPath(
  cwd: string,
  grants: AttachedRoot[],
  inputPath: string,
): ResolvedGrantedPath | null {
  const trimmed = inputPath.trim();
  if (!trimmed) return null;

  const resolvedCwd = normalizeExistingPath(cwd);
  const absolutePath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(resolvedCwd, trimmed);

  if (!isPathGranted(cwd, grants, absolutePath)) {
    return null;
  }

  return {
    absolutePath,
    displayPath: displayPathForAbsolute(cwd, grants, absolutePath),
  };
}

export function attachedRootLabel(absolutePath: string, _kind: AttachedRootKind): string {
  return basename(normalize(absolutePath).replace(/\\/g, "/")) || absolutePath;
}
