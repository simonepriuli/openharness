import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, normalize } from "node:path";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveGrantedPath } from "../shared/path-grants.js";

const MAX_FILE_BYTES = 512 * 1024;

export type WriteProjectFileError =
  | "not_found"
  | "too_large"
  | "outside_project"
  | "directory";

export type WriteProjectFileResult =
  | { ok: true; relativePath: string; mtimeMs: number }
  | { ok: false; relativePath: string; error: WriteProjectFileError };

export async function writeProjectFile(
  cwd: string,
  relativePath: string,
  contents: string,
  grants: AttachedRoot[] = [],
): Promise<WriteProjectFileResult> {
  const resolved = resolveGrantedPath(cwd, grants, relativePath);
  if (!resolved) {
    return { ok: false, relativePath, error: "outside_project" };
  }

  const safeRelativePath = normalize(resolved.displayPath).replace(/\\/g, "/");
  const absolutePath = resolved.absolutePath;
  const bytes = Buffer.byteLength(contents, "utf8");

  if (bytes > MAX_FILE_BYTES) {
    return { ok: false, relativePath: safeRelativePath, error: "too_large" };
  }

  try {
    const fileStat = await stat(absolutePath).catch(() => null);
    if (fileStat?.isDirectory()) {
      return { ok: false, relativePath: safeRelativePath, error: "directory" };
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
    const afterStat = await stat(absolutePath);
    return { ok: true, relativePath: safeRelativePath, mtimeMs: afterStat.mtimeMs };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return { ok: false, relativePath: safeRelativePath, error: "not_found" };
    }
    throw err;
  }
}
