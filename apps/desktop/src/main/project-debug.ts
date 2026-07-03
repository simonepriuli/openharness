import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function debugRelativePath(conversationId: string): string {
  return `.openharness/debug/${conversationId}.md`;
}

export function debugAbsolutePath(cwd: string, conversationId: string): string {
  return join(cwd, debugRelativePath(conversationId));
}

export type DebugFileResult =
  | { ok: true; relativePath: string; contents: string }
  | { ok: false; relativePath: string; missing: true }
  | { ok: false; relativePath: string; error: string };

export async function readDebugFile(cwd: string, conversationId: string): Promise<DebugFileResult> {
  const relativePath = debugRelativePath(conversationId);
  const absolutePath = join(cwd, relativePath);
  try {
    const contents = await readFile(absolutePath, "utf8");
    return { ok: true, relativePath, contents };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, relativePath, missing: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, relativePath, error: message };
  }
}

export async function deleteDebugFile(cwd: string, conversationId: string): Promise<void> {
  const absolutePath = debugAbsolutePath(cwd, conversationId);
  try {
    await unlink(absolutePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
}

export async function writeDebugFile(
  cwd: string,
  conversationId: string,
  markdown: string,
): Promise<{ relativePath: string }> {
  const relativePath = debugRelativePath(conversationId);
  const absolutePath = join(cwd, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, markdown, "utf8");
  return { relativePath };
}
