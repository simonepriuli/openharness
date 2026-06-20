import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitRemoteInfo = {
  isGitRepo: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
};

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

export function parseGithubRemoteUrl(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  const url = remoteUrl.trim();
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]!.replace(/\.git$/i, "") };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return null;
    const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/i, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export async function getGitRemoteInfo(cwd: string): Promise<GitRemoteInfo> {
  if (!(await isGitRepo(cwd))) {
    return { isGitRepo: false, remoteUrl: null, owner: null, repo: null };
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const remoteUrl = stdout.trim() || null;
    if (!remoteUrl) {
      return { isGitRepo: true, remoteUrl: null, owner: null, repo: null };
    }
    const parsed = parseGithubRemoteUrl(remoteUrl);
    return {
      isGitRepo: true,
      remoteUrl,
      owner: parsed?.owner ?? null,
      repo: parsed?.repo ?? null,
    };
  } catch {
    return { isGitRepo: true, remoteUrl: null, owner: null, repo: null };
  }
}
