import { readFileSync } from "node:fs";
import type { GithubActionsConfig } from "./config.js";
import { pushCurrentBranch } from "./git-push.js";

type ApiErrorBody = { error?: string; message?: string };

function prBase(config: GithubActionsConfig, suffix = ""): string {
  const root = `/api/source-control/pr/github/${encodeURIComponent(config.namespace)}/${encodeURIComponent(config.repo)}`;
  return suffix ? `${root}/${suffix}` : root;
}

function authHeaders(config: GithubActionsConfig): Record<string, string> {
  return {
    cookie: config.auth.cookie,
    authorization: `Bearer ${config.auth.sessionToken}`,
    "content-type": "application/json",
    "electron-origin": "openharness:/",
    "x-skip-oauth-proxy": "true",
  };
}

async function apiRequest<T>(
  config: GithubActionsConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const baseUrl = config.auth.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(config),
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => null)) as (T & ApiErrorBody) | null;
  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.message ?? data.error)) ||
      `Request failed (${response.status})`;
    throw new Error(String(message));
  }
  if (data === null) {
    throw new Error(`Request failed (${response.status})`);
  }
  return data as T;
}

export async function fetchPrContext(
  config: GithubActionsConfig,
  prNumber: number,
): Promise<{
  pullRequest: {
    number: number;
    title: string;
    url: string;
    headSha: string;
    headRef: string;
    baseRef: string;
  };
}> {
  return apiRequest(config, prBase(config, `${prNumber}/context`), { method: "GET" });
}

export async function findOpenPullRequestForHead(
  config: GithubActionsConfig,
  headRef: string,
): Promise<{ number: number; title: string; url: string } | null> {
  const query = new URLSearchParams({ ref: headRef.trim() });
  const response = await apiRequest<{ pull: { number: number; title: string; url: string } | null }>(
    config,
    `${prBase(config)}/open-by-head?${query}`,
    { method: "GET" },
  );
  return response.pull ?? null;
}

export async function approvePullRequest(
  config: GithubActionsConfig,
  prNumber: number,
  options: { summary: string; commitId?: string },
): Promise<void> {
  await apiRequest(config, prBase(config, `${prNumber}/review`), {
    method: "POST",
    body: JSON.stringify({
      event: "APPROVE",
      body: options.summary,
      commit_id: options.commitId,
    }),
  });
}

export async function submitPullRequestReview(
  config: GithubActionsConfig,
  prNumber: number,
  options: {
    summary: string;
    commitId?: string;
    inlineComments: Array<{ path: string; line: number; body: string }>;
  },
): Promise<void> {
  await apiRequest(config, prBase(config, `${prNumber}/review`), {
    method: "POST",
    body: JSON.stringify({
      event: "COMMENT",
      body: options.summary,
      commit_id: options.commitId,
      comments: options.inlineComments.map((comment) => ({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        side: "RIGHT",
      })),
    }),
  });
}

export async function createPullRequest(
  config: GithubActionsConfig,
  cwd: string,
  options: { title: string; body: string; head?: string; base?: string },
): Promise<{ number: number; title: string; url: string; headRef: string; baseRef: string }> {
  const head = options.head?.trim() || (await readCurrentBranch(cwd));
  const response = await apiRequest<{ pull: { number: number; title: string; url: string; headRef: string; baseRef: string } }>(
    config,
    prBase(config, "pulls"),
    {
      method: "POST",
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head,
        base: options.base,
      }),
    },
  );
  return response.pull;
}

export async function pushBranch(
  config: GithubActionsConfig,
  cwd: string,
  options: { commitMessage?: string; headRef?: string },
): Promise<{ branch: string; committed: boolean }> {
  const credentials = await apiRequest<{
    username: string;
    token: string;
    remoteUrl: string;
  }>(config, prBase(config, "git-credentials"), { method: "GET" });

  return pushCurrentBranch(cwd, credentials, options);
}

async function readCurrentBranch(cwd: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  const branch = stdout.trim();
  if (!branch) throw new Error("Could not determine current git branch");
  return branch;
}

export function readAuthFile(path: string): string {
  return readFileSync(path, "utf8");
}
