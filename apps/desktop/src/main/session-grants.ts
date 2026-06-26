import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AttachedRoot } from "../shared/path-grants.js";
import { grantsToSessionPayload } from "../shared/path-grants.js";

function sessionGrantsDir(): string {
  const dir = join(app.getPath("userData"), "session-grants");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionKeyToFilename(sessionKey: string): string {
  return `${Buffer.from(sessionKey, "utf8").toString("base64url")}.json`;
}

export function sessionGrantsFilePath(sessionKey: string): string {
  return join(sessionGrantsDir(), sessionKeyToFilename(sessionKey));
}

export function writeSessionGrants(sessionKey: string, grants: AttachedRoot[]): string {
  const filePath = sessionGrantsFilePath(sessionKey);
  const payload = grantsToSessionPayload(grants);
  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function readSessionGrants(filePath: string): AttachedRoot[] {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AttachedRoot =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as AttachedRoot).id === "string" &&
        typeof (entry as AttachedRoot).absolutePath === "string" &&
        ((entry as AttachedRoot).kind === "file" || (entry as AttachedRoot).kind === "folder") &&
        typeof (entry as AttachedRoot).label === "string",
    );
  } catch {
    return [];
  }
}
