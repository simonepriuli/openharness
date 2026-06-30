import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pdf"]);

type AttachedRoot = {
  absolutePath: string;
  kind: "file" | "folder";
};

function normalizePathForCompare(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, "/");
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizePathForCompare(path.resolve(targetPath));
  const normalizedRoot = normalizePathForCompare(path.resolve(rootPath));
  if (normalizedTarget === normalizedRoot) return true;
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedTarget.startsWith(prefix);
}

function normalizeExistingPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function isPathWithinCwd(cwd: string, targetPath: string): boolean {
  const normalizedCwd = normalizePathForCompare(normalizeExistingPath(cwd));
  const normalizedTarget = normalizePathForCompare(normalizeExistingPath(targetPath));
  if (normalizedTarget === normalizedCwd) return true;
  const prefix = normalizedCwd.endsWith("/") ? normalizedCwd : `${normalizedCwd}/`;
  return normalizedTarget.startsWith(prefix);
}

function grantCoversPath(grant: AttachedRoot, absolutePath: string): boolean {
  if (grant.kind === "file") {
    return normalizePathForCompare(grant.absolutePath) === normalizePathForCompare(absolutePath);
  }
  return isPathWithinRoot(absolutePath, grant.absolutePath);
}

function readAttachedRootsFromEnv(): AttachedRoot[] {
  const filePath = process.env.OPENHARNESS_ATTACHED_ROOTS_FILE?.trim();
  if (!filePath) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AttachedRoot =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as AttachedRoot).absolutePath === "string" &&
        ((entry as AttachedRoot).kind === "file" || (entry as AttachedRoot).kind === "folder"),
    );
  } catch {
    return [];
  }
}

function isPathGranted(cwd: string, grants: AttachedRoot[], targetPath: string): boolean {
  const absolutePath = normalizeExistingPath(targetPath);
  if (isPathWithinCwd(cwd, absolutePath)) return true;
  return grants.some((grant) => grantCoversPath(grant, absolutePath));
}

export function isOfficeExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return OFFICE_EXTENSIONS.has(ext);
}

export function isPdfExtension(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".pdf";
}

export function resolveOfficePath(cwd: string, filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("Path is required.");
  }

  const attachedGrants = readAttachedRootsFromEnv();
  const resolvedCwd = path.resolve(cwd);
  const normalizedCwd = existsSync(resolvedCwd) ? realpathSync(resolvedCwd) : resolvedCwd;
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(normalizedCwd, trimmed);

  if (!isOfficeExtension(resolved)) {
    throw new Error(`Unsupported file type (expected .docx, .xlsx, or .pdf): ${trimmed}`);
  }

  const normalizedTarget = existsSync(resolved) ? realpathSync(resolved) : resolved;
  if (!isPathGranted(cwd, attachedGrants, normalizedTarget)) {
    throw new Error(`Path is not allowed for this conversation: ${trimmed}`);
  }

  return normalizedTarget;
}
