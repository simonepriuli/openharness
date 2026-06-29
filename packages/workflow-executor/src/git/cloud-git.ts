import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { GitCredentials } from "../deps.js";
import {
  buildAuthenticatedRemoteUrl,
  createWorkflowGitOps,
  isGitRepository,
  runGit,
} from "./workflow-git.js";

const execFileAsync = promisify(execFile);

export type EnsureRepoCloneOptions = {
  reposRoot: string;
  organizationId: string;
  connectionId: string;
  credentials: GitCredentials;
  defaultBranch?: string;
};

export async function ensureRepoClone(options: EnsureRepoCloneOptions): Promise<string> {
  const repoDir = join(options.reposRoot, options.organizationId, options.connectionId);
  const authUrl = buildAuthenticatedRemoteUrl(
    options.credentials.remoteUrl,
    options.credentials.username,
    options.credentials.token,
  );

  if (await isGitRepository(repoDir)) {
    const branch = options.defaultBranch?.trim() || "HEAD";
    await runGit(repoDir, ["fetch", "--depth", "1", authUrl, branch]);
    return repoDir;
  }

  await mkdir(dirname(repoDir), { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", authUrl, connectionIdFromPath(repoDir)], {
    cwd: dirname(repoDir),
    maxBuffer: 20 * 1024 * 1024,
  });
  return repoDir;
}

function connectionIdFromPath(repoDir: string): string {
  const parts = repoDir.split(/[/\\]/);
  return parts[parts.length - 1] ?? "repo";
}

export async function cleanupRunWorktrees(worktreesRoot: string): Promise<void> {
  await rm(worktreesRoot, { recursive: true, force: true });
}

export function createCloudGitOps(options: { worktreesRoot: string }) {
  void options.worktreesRoot;
  return createWorkflowGitOps();
}

export { buildAuthenticatedRemoteUrl, isGitRepository, runGit };
