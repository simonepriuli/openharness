import { app } from "electron";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

export function getWorkflowWorktreesRoot(): string {
  return join(app.getPath("userData"), "workflow-worktrees");
}

export function isWorkflowWorktreeCwd(cwd: string): boolean {
  const root = resolve(getWorkflowWorktreesRoot());
  const resolved = resolve(cwd);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}

const execFileAsync = promisify(execFile);

export function buildAuthenticatedRemoteUrl(
  remoteUrl: string,
  username: string,
  token: string,
): string {
  return remoteUrl.replace(
    /^https:\/\//,
    `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`,
  );
}

export async function runGit(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function preparePrWorktree(options: {
  repoCwd: string;
  worktreesRoot: string;
  owner: string;
  repo: string;
  prNumber: number;
  headRef: string;
  headSha: string;
  credentials?: { username: string; token: string; remoteUrl: string };
}): Promise<{ worktreePath: string; branchName: string }> {
  const branchName = `openharness/pr-${options.prNumber}`;
  const worktreePath = join(
    options.worktreesRoot,
    `${options.owner}-${options.repo}`,
    `pr-${options.prNumber}`,
  );

  await mkdir(join(options.worktreesRoot, `${options.owner}-${options.repo}`), {
    recursive: true,
  });

  try {
    await runGit(options.repoCwd, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    // worktree may not exist yet
  }

  try {
    await rm(worktreePath, { recursive: true, force: true });
  } catch {
    // directory may not exist
  }

  await runGit(options.repoCwd, [
    "fetch",
    options.credentials
      ? buildAuthenticatedRemoteUrl(
          options.credentials.remoteUrl,
          options.credentials.username,
          options.credentials.token,
        )
      : "origin",
    `${options.headRef}:${branchName}`,
  ]);
  await runGit(options.repoCwd, [
    "worktree",
    "add",
    "-B",
    branchName,
    worktreePath,
    options.headSha,
  ]);

  return { worktreePath, branchName };
}

export async function prepareBranchWorktree(options: {
  repoCwd: string;
  worktreesRoot: string;
  owner: string;
  repo: string;
  branch: string;
  credentials?: { username: string; token: string; remoteUrl: string };
}): Promise<{ worktreePath: string; branchName: string }> {
  const safeBranch = options.branch.replace(/[^a-zA-Z0-9._/-]+/g, "-");
  const branchName = `openharness/branch-${safeBranch}`;
  const worktreePath = join(
    options.worktreesRoot,
    `${options.owner}-${options.repo}`,
    `branch-${safeBranch}`,
  );

  await mkdir(join(options.worktreesRoot, `${options.owner}-${options.repo}`), {
    recursive: true,
  });

  try {
    await runGit(options.repoCwd, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    // worktree may not exist yet
  }

  try {
    await rm(worktreePath, { recursive: true, force: true });
  } catch {
    // directory may not exist
  }

  await runGit(options.repoCwd, [
    "fetch",
    options.credentials
      ? buildAuthenticatedRemoteUrl(
          options.credentials.remoteUrl,
          options.credentials.username,
          options.credentials.token,
        )
      : "origin",
    `${options.branch}:${branchName}`,
  ]);
  await runGit(options.repoCwd, ["worktree", "add", "-B", branchName, worktreePath, branchName]);

  return { worktreePath, branchName };
}

export async function pushWorktreeBranch(options: {
  worktreePath: string;
  remoteUrl: string;
  username: string;
  token: string;
  headRef: string;
}): Promise<void> {
  const authRemote = buildAuthenticatedRemoteUrl(
    options.remoteUrl,
    options.username,
    options.token,
  );

  await runGit(options.worktreePath, ["remote", "set-url", "origin", authRemote]);
  await runGit(options.worktreePath, ["push", "origin", `HEAD:refs/heads/${options.headRef}`]);
}

export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  return stdout.trim().length > 0;
}

export async function commitAllChanges(
  worktreePath: string,
  message: string,
): Promise<boolean> {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  if (!stdout.trim()) return false;

  await runGit(worktreePath, ["add", "-A"]);
  await runGit(worktreePath, ["commit", "-m", message]);
  return true;
}

export function isGitRepository(cwd: string): Promise<boolean> {
  return runGit(cwd, ["rev-parse", "--is-inside-work-tree"])
    .then(() => true)
    .catch(() => false);
}
