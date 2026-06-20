import { getAuthClient } from "./auth-client.js";
import { ELECTRON_AUTH_SCHEME, getApiBaseUrl } from "./auth-config.js";

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

type FetchErrorPayload = {
  status?: number;
  statusText?: string;
  message?: string;
  error?: string;
};

function readFetchError(error: FetchErrorPayload | null | undefined): OpenHarnessApiError {
  const status = error?.status ?? 500;
  const message =
    (typeof error?.message === "string" && error.message) ||
    (typeof error?.error === "string" && error.error) ||
    (typeof error?.statusText === "string" && error.statusText) ||
    `Request failed (${status})`;
  return new OpenHarnessApiError(message, status, typeof error?.error === "string" ? error.error : undefined);
}

function parseBetterFetchResult<T>(result: unknown, options?: { allowNull?: boolean }): T | null {
  if (result && typeof result === "object" && "data" in result && "error" in result) {
    const wrapped = result as {
      data: T | null;
      error: FetchErrorPayload | null;
    };
    if (wrapped.error) {
      throw readFetchError(wrapped.error);
    }
    if (wrapped.data === null || wrapped.data === undefined) {
      if (options?.allowNull) {
        return null;
      }
      throw new OpenHarnessApiError("Request failed", 500);
    }
    return wrapped.data;
  }

  return result as T;
}

function authRequestHeaders(cookie: string, sessionToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    cookie,
    "content-type": "application/json",
    "electron-origin": `${ELECTRON_AUTH_SCHEME}:/`,
    "x-skip-oauth-proxy": "true",
  };
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

async function createAuthenticatedRequestContext(): Promise<{
  cookie: string;
  sessionToken: string;
}> {
  const client = getAuthClient();
  const cookie = client.getCookie();
  if (!cookie) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  const sessionResult = await client.$fetch("/get-session", {
    method: "GET",
    headers: authRequestHeaders(cookie),
  });

  const sessionData = parseBetterFetchResult<{
    user: { id: string } | null;
    session: { token: string } | null;
  } | null>(sessionResult, { allowNull: true });

  if (!sessionData?.user || !sessionData.session?.token) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  return {
    cookie,
    sessionToken: sessionData.session.token,
  };
}

async function apiRequest<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const { cookie, sessionToken } = await createAuthenticatedRequestContext();
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    method: init.method ?? "GET",
    headers: authRequestHeaders(cookie, sessionToken),
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

  if (data === null) {
    throw new OpenHarnessApiError(`Request failed (${response.status})`, response.status);
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
