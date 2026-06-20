import { getAuthClient } from "./auth-client.js";
import { getApiBaseUrl } from "./auth-config.js";

export type GithubInstallationSummary = {
  installationId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  repoCount: number;
};

export type GithubStatus = {
  configured: boolean;
  loginComplete: boolean;
  agentReady: boolean;
  installations: GithubInstallationSummary[];
};

export type GithubRepoSummary = {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  installationId: string;
};

export type GithubProjectConnection =
  | { connected: false }
  | {
      connected: true;
      owner: string;
      repo: string;
      fullName: string;
      githubRepoId: string;
      installationId: string;
      remoteUrl: string | null;
    };

export type GithubConnectResult = GithubProjectConnection & {
  warning?: string | null;
};

export class OpenHarnessApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "OpenHarnessApiError";
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const client = getAuthClient();
  const session = await client.getSession();
  const token = session.data?.session?.token;
  if (!token) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  return {
    Cookie: `better-auth.session_token=${token}`,
  };
}

async function apiRequest<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const authHeaders = await getAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string; code?: string })
    | null;

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && ("message" in data ? data.message : data.error)) ||
      `Request failed (${response.status})`;
    throw new OpenHarnessApiError(String(message), response.status, data?.error);
  }

  return data as T;
}

export async function fetchGithubStatus(): Promise<GithubStatus> {
  return apiRequest<GithubStatus>("/api/github/status");
}

export async function fetchGithubInstallUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/api/github/install-url");
}

export async function fetchGithubConnection(projectPath: string): Promise<GithubProjectConnection> {
  const params = new URLSearchParams({ projectPath });
  return apiRequest<GithubProjectConnection>(`/api/github/connection?${params.toString()}`);
}

export async function connectGithubProject(options: {
  projectPath: string;
  owner: string;
  repo: string;
  remoteUrl?: string | null;
}): Promise<GithubConnectResult> {
  return apiRequest<GithubConnectResult>("/api/github/connection", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function disconnectGithubProject(projectPath: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/api/github/connection", {
    method: "DELETE",
    body: JSON.stringify({ projectPath }),
  });
}

export async function listGithubRepos(options?: {
  q?: string;
  page?: number;
}): Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (options?.page) params.set("page", String(options.page));
  const query = params.toString();
  return apiRequest(`/api/github/repos${query ? `?${query}` : ""}`);
}
