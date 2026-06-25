import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx"]);

export function isOfficeExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return OFFICE_EXTENSIONS.has(ext);
}

export function resolveOfficePath(cwd: string, filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("Path is required.");
  }

  const resolvedCwd = path.resolve(cwd);
  const normalizedCwd = existsSync(resolvedCwd) ? realpathSync(resolvedCwd) : resolvedCwd;
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(normalizedCwd, trimmed);

  if (!isOfficeExtension(resolved)) {
    throw new Error(`Unsupported file type (expected .docx or .xlsx): ${trimmed}`);
  }

  const normalizedTarget = existsSync(resolved) ? realpathSync(resolved) : resolved;
  const relative = path.relative(normalizedCwd, normalizedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${trimmed}`);
  }

  return resolved;
}
