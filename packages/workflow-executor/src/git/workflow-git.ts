import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { WorkflowGitOps } from "../deps.js";

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

export function branchFetchRef(kind: "branch" | "pr", key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._/-]+/g, "-");
  return `refs/openharness/fetches/${kind}-${safeKey}`;
}

async function removeWorktreeAt(repoCwd: string, worktreePath: string): Promise<void> {
  try {
    await runGit(repoCwd, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    // worktree may not exist yet
  }

  try {
    await rm(worktreePath, { recursive: true, force: true });
  } catch {
    // directory may not exist
  }

  try {
    await runGit(repoCwd, ["worktree", "prune"]);
  } catch {
    // best effort
  }
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
  const fetchRef = branchFetchRef("pr", String(options.prNumber));
  const remote = options.credentials
    ? buildAuthenticatedRemoteUrl(
        options.credentials.remoteUrl,
        options.credentials.username,
        options.credentials.token,
      )
    : "origin";

  await mkdir(join(options.worktreesRoot, `${options.owner}-${options.repo}`), {
    recursive: true,
  });

  await removeWorktreeAt(options.repoCwd, worktreePath);

  await runGit(options.repoCwd, [
    "fetch",
    "--depth",
    "1",
    remote,
    `+${options.headRef}:${fetchRef}`,
  ]);
  await runGit(options.repoCwd, ["worktree", "add", "--detach", worktreePath, options.headSha]);

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
  const fetchRef = branchFetchRef("branch", safeBranch);
  const remote = options.credentials
    ? buildAuthenticatedRemoteUrl(
        options.credentials.remoteUrl,
        options.credentials.username,
        options.credentials.token,
      )
    : "origin";

  await mkdir(join(options.worktreesRoot, `${options.owner}-${options.repo}`), {
    recursive: true,
  });

  await removeWorktreeAt(options.repoCwd, worktreePath);

  await runGit(options.repoCwd, [
    "fetch",
    "--depth",
    "1",
    remote,
    `+refs/heads/${options.branch}:${fetchRef}`,
  ]);
  await runGit(options.repoCwd, ["worktree", "add", "--detach", worktreePath, fetchRef]);

  return { worktreePath, branchName };
}

export async function resumeBranchWorktree(options: {
  worktreePath: string;
  repoCwd: string;
  worktreesRoot: string;
  owner: string;
  repo: string;
  branch: string;
  credentials?: { username: string; token: string; remoteUrl: string };
}): Promise<{ worktreePath: string; branchName: string }> {
  const safeBranch = options.branch.replace(/[^a-zA-Z0-9._/-]+/g, "-");
  const branchName = `openharness/branch-${safeBranch}`;
  const defaultWorktreePath = join(
    options.worktreesRoot,
    `${options.owner}-${options.repo}`,
    `branch-${safeBranch}`,
  );
  const worktreePath = options.worktreePath || defaultWorktreePath;

  if (await isGitRepository(worktreePath)) {
    return { worktreePath, branchName };
  }

  return prepareBranchWorktree({
    repoCwd: options.repoCwd,
    worktreesRoot: options.worktreesRoot,
    owner: options.owner,
    repo: options.repo,
    branch: options.branch,
    credentials: options.credentials,
  });
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  return runGit(cwd, ["rev-parse", "--is-inside-work-tree"])
    .then(() => true)
    .catch(() => false);
}

export function createWorkflowGitOps(): WorkflowGitOps {
  return {
    isGitRepository,
    preparePrWorktree,
    prepareBranchWorktree,
    resumeBranchWorktree,
  };
}

export function createUnimplementedGitOps(): WorkflowGitOps {
  const notImplemented = async (): Promise<never> => {
    throw new Error("Cloud git operations are not implemented until Step 4");
  };
  return {
    isGitRepository: notImplemented,
    preparePrWorktree: notImplemented,
    prepareBranchWorktree: notImplemented,
  };
}
