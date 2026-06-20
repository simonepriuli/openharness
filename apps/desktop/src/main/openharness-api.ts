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

function unwrapFetchResult<T>(result: unknown): T {
  if (result && typeof result === "object" && "data" in result && "error" in result) {
    const wrapped = result as {
      data: T | null;
      error: { status?: number; message?: string } | null;
    };
    if (wrapped.error) {
      throw new OpenHarnessApiError(
        wrapped.error.message ?? "Request failed",
        wrapped.error.status ?? 500,
      );
    }
    if (wrapped.data === null || wrapped.data === undefined) {
      throw new OpenHarnessApiError("Request failed", 500);
    }
    return wrapped.data;
  }

  return result as T;
}

function authRequestHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    "content-type": "application/json",
  };
}

/**
 * Use the same Better Auth transport as `getUser` (electron $fetch + signed cookies).
 */
async function createAuthenticatedRequestContext(): Promise<{
  client: ReturnType<typeof getAuthClient>;
  cookie: string;
  sessionToken: string;
}> {
  const client = getAuthClient();
  const cookie = client.getCookie();
  if (!cookie) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  const headers = authRequestHeaders(cookie);
  const sessionResult = await client.$fetch("/get-session", {
    method: "GET",
    headers,
  });

  const sessionData = unwrapFetchResult<{
    user: { id: string } | null;
    session: { token: string } | null;
  } | null>(sessionResult);

  if (!sessionData?.user || !sessionData.session?.token) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  return {
    client,
    cookie,
    sessionToken: sessionData.session.token,
  };
}

async function apiRequest<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const { client, cookie, sessionToken } = await createAuthenticatedRequestContext();
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}${path}`;
  const headers = authRequestHeaders(cookie);
  headers.authorization = `Bearer ${sessionToken}`;

  const result = await client.$fetch(url, {
    method: (init.method ?? "GET") as "GET" | "POST" | "DELETE",
    headers,
    body:
      init.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined,
  });

  return unwrapFetchResult<T>(result);
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
