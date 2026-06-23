import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SourceControlProviderId = "github" | "azure_devops";

export type GitRemoteInfo = {
  isGitRepo: boolean;
  remoteUrl: string | null;
  provider: SourceControlProviderId | null;
  owner: string | null;
  repo: string | null;
  namespace: string | null;
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

export function parseAzureDevOpsRemoteUrl(
  remoteUrl: string,
): { project: string; repo: string } | null {
  const url = remoteUrl.trim();

  const sshMatch = url.match(
    /^ssh:\/\/git@ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (sshMatch) {
    return { project: sshMatch[2]!, repo: sshMatch[3]!.replace(/\.git$/i, "") };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("dev.azure.com")) return null;
    const parts = parsed.pathname.replace(/^\//, "").split("/");
    if (parts.length >= 4 && parts[1] && parts[2] === "_git" && parts[3]) {
      return { project: parts[1], repo: parts[3].replace(/\.git$/i, "") };
    }
  } catch {
    return null;
  }

  return null;
}

export function detectRemoteProvider(
  remoteUrl: string,
): { provider: SourceControlProviderId; namespace: string; name: string } | null {
  const github = parseGithubRemoteUrl(remoteUrl);
  if (github) {
    return { provider: "github", namespace: github.owner, name: github.repo };
  }

  const ado = parseAzureDevOpsRemoteUrl(remoteUrl);
  if (ado) {
    return { provider: "azure_devops", namespace: ado.project, name: ado.repo };
  }

  return null;
}

export async function getGitRemoteInfo(cwd: string): Promise<GitRemoteInfo> {
  if (!(await isGitRepo(cwd))) {
    return {
      isGitRepo: false,
      remoteUrl: null,
      provider: null,
      owner: null,
      repo: null,
      namespace: null,
    };
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const remoteUrl = stdout.trim() || null;
    if (!remoteUrl) {
      return {
        isGitRepo: true,
        remoteUrl: null,
        provider: null,
        owner: null,
        repo: null,
        namespace: null,
      };
    }

    const detected = detectRemoteProvider(remoteUrl);
    return {
      isGitRepo: true,
      remoteUrl,
      provider: detected?.provider ?? null,
      owner: detected?.namespace ?? null,
      repo: detected?.name ?? null,
      namespace: detected?.namespace ?? null,
    };
  } catch {
    return {
      isGitRepo: true,
      remoteUrl: null,
      provider: null,
      owner: null,
      repo: null,
      namespace: null,
    };
  }
}
