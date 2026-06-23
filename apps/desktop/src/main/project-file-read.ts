import { open, readFile, stat } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";

const MAX_FILE_BYTES = 512 * 1024;

export type ReadProjectFileError = "not_found" | "too_large" | "binary" | "outside_project" | "directory";

export type ReadProjectFileResult =
  | { ok: true; relativePath: string; contents: string }
  | { ok: false; relativePath: string; error: ReadProjectFileError };

function resolveProjectRelativePath(cwd: string, relativePath: string): string | null {
  const normalizedCwd = resolve(cwd);
  const absolutePath = resolve(normalizedCwd, relativePath);
  const rel = relative(normalizedCwd, absolutePath);
  if (rel.startsWith("..") || rel === "..") return null;
  return normalize(relativePath).replace(/\\/g, "/");
}

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
): Promise<ReadProjectFileResult> {
  const safeRelativePath = resolveProjectRelativePath(cwd, relativePath);
  if (!safeRelativePath) {
    return { ok: false, relativePath, error: "outside_project" };
  }

  const absolutePath = join(cwd, safeRelativePath);

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
