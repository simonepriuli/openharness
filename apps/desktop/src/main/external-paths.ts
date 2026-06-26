import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { AttachedRoot, AttachedRootKind } from "../shared/path-grants.js";
import { attachedRootLabel } from "../shared/path-grants.js";

export function normalizePickedPath(pickedPath: string): string {
  const resolved = resolve(pickedPath);
  if (!existsSync(resolved)) {
    return resolved;
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function kindForPickedPath(absolutePath: string): AttachedRootKind {
  if (!existsSync(absolutePath)) {
    return absolutePath.toLowerCase().endsWith(".xlsx") ? "file" : "folder";
  }
  try {
    return statSync(absolutePath).isDirectory() ? "folder" : "file";
  } catch {
    return "file";
  }
}

export function attachedRootFromPickedPath(pickedPath: string, id?: string): AttachedRoot {
  const absolutePath = normalizePickedPath(pickedPath);
  const kind = kindForPickedPath(absolutePath);
  return {
    id: id ?? crypto.randomUUID(),
    absolutePath,
    kind,
    label: attachedRootLabel(absolutePath, kind),
  };
}

export function isXlsxPath(filePath: string): boolean {
  return basename(filePath).toLowerCase().endsWith(".xlsx");
}
