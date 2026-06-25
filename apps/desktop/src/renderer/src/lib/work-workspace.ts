const WORK_WORKSPACE_DIR_NAME = "work-workspace";

let cachedWorkWorkspacePath: string | null = null;

export function isWorkWorkspaceCwd(cwd: string): boolean {
  const normalized = cwd.replace(/\\/g, "/");
  return normalized.endsWith(`/${WORK_WORKSPACE_DIR_NAME}`);
}

export async function getWorkWorkspacePath(): Promise<string> {
  if (cachedWorkWorkspacePath) return cachedWorkWorkspacePath;
  cachedWorkWorkspacePath = await window.harness.getWorkWorkspacePath();
  return cachedWorkWorkspacePath;
}
