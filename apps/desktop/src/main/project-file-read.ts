import { open, readFile, stat } from "node:fs/promises";
import { normalize } from "node:path";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveGrantedPath } from "../shared/path-grants.js";

const MAX_FILE_BYTES = 512 * 1024;

export type ReadProjectFileError = "not_found" | "too_large" | "binary" | "outside_project" | "directory";

export type ReadProjectFileResult =
  | { ok: true; relativePath: string; contents: string }
  | { ok: false; relativePath: string; error: ReadProjectFileError };

async function looksBinary(filePath: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } catch {
    return true;
  } finally {
    await handle?.close();
  }
}

export async function readProjectFile(
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): Promise<ReadProjectFileResult> {
  const resolved = resolveGrantedPath(cwd, grants, relativePath);
  if (!resolved) {
    return { ok: false, relativePath, error: "outside_project" };
  }

  const safeRelativePath = normalize(resolved.displayPath).replace(/\\/g, "/");
  const absolutePath = resolved.absolutePath;

  try {
    const fileStat = await stat(absolutePath);
    if (fileStat.isDirectory()) {
      return { ok: false, relativePath: safeRelativePath, error: "directory" };
    }
    if (fileStat.size > MAX_FILE_BYTES) {
      return { ok: false, relativePath: safeRelativePath, error: "too_large" };
    }
    if (await looksBinary(absolutePath)) {
      return { ok: false, relativePath: safeRelativePath, error: "binary" };
    }

    const contents = await readFile(absolutePath, "utf8");
    return { ok: true, relativePath: safeRelativePath, contents };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return { ok: false, relativePath: safeRelativePath, error: "not_found" };
    }
    throw err;
  }
}
