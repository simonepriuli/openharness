import { app } from "electron";
import { join, resolve, sep } from "node:path";
export {
  buildAuthenticatedRemoteUrl,
  createWorkflowGitOps,
  isGitRepository,
  prepareBranchWorktree,
  preparePrWorktree,
  runGit,
} from "@openharness/workflow-executor";

export function getWorkflowWorktreesRoot(): string {
  return join(app.getPath("userData"), "workflow-worktrees");
}

export function isWorkflowWorktreeCwd(cwd: string): boolean {
  const root = resolve(getWorkflowWorktreesRoot());
  const resolved = resolve(cwd);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}
