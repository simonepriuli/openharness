import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function planRelativePath(conversationId: string): string {
  return `.openharness/plans/${conversationId}.md`;
}

export function planAbsolutePath(cwd: string, conversationId: string): string {
  return join(cwd, planRelativePath(conversationId));
}

export type PlanFileResult =
  | { ok: true; relativePath: string; contents: string }
  | { ok: false; relativePath: string; missing: true }
  | { ok: false; relativePath: string; error: string };

export async function readPlanFile(cwd: string, conversationId: string): Promise<PlanFileResult> {
  const relativePath = planRelativePath(conversationId);
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

export async function deletePlanFile(cwd: string, conversationId: string): Promise<void> {
  const absolutePath = planAbsolutePath(cwd, conversationId);
  try {
    await unlink(absolutePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
}

export async function writePlanFile(
  cwd: string,
  conversationId: string,
  markdown: string,
): Promise<{ relativePath: string }> {
  const relativePath = planRelativePath(conversationId);
  const absolutePath = join(cwd, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, markdown, "utf8");
  return { relativePath };
}
