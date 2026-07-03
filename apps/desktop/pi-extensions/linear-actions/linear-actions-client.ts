import type { LinearActionsConfig } from "./config.js";
import { authHeaders } from "./auth.js";

type ApiErrorBody = { error?: string; message?: string };

async function apiRequest<T>(
  config: LinearActionsConfig,
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

export async function searchLinearIssues(
  config: LinearActionsConfig,
  options: { query?: string; teamId?: string; projectId?: string; limit?: number },
) {
  return apiRequest<{ issues: unknown[] }>(config, "/api/linear/tools/search-issues", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function getLinearIssue(
  config: LinearActionsConfig,
  options: { issueId?: string; identifier?: string },
) {
  return apiRequest<{ issue: unknown | null }>(config, "/api/linear/tools/get-issue", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function listLinearProjects(config: LinearActionsConfig) {
  return apiRequest<{ projects: unknown[] }>(config, "/api/linear/tools/projects", {
    method: "GET",
  });
}

export async function listLinearTeams(config: LinearActionsConfig) {
  return apiRequest<{ teams: unknown[] }>(config, "/api/linear/tools/teams", { method: "GET" });
}

export async function listLinearCycles(config: LinearActionsConfig, teamId?: string) {
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return apiRequest<{ cycles: unknown[] }>(config, `/api/linear/tools/cycles${query}`, {
    method: "GET",
  });
}

export async function listLinearLabels(config: LinearActionsConfig, teamId?: string) {
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return apiRequest<{ labels: unknown[] }>(config, `/api/linear/tools/labels${query}`, {
    method: "GET",
  });
}

export async function createLinearIssue(
  config: LinearActionsConfig,
  input: {
    teamId: string;
    title: string;
    description?: string;
    projectId?: string;
    priority?: number;
    labelIds?: string[];
    assigneeId?: string;
  },
) {
  return apiRequest<{ issue: unknown }>(config, "/api/linear/tools/issues", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLinearIssue(
  config: LinearActionsConfig,
  issueId: string,
  input: Record<string, unknown>,
) {
  return apiRequest<{ issue: unknown }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function assignLinearIssue(
  config: LinearActionsConfig,
  issueId: string,
  assigneeId: string | null,
) {
  return apiRequest<{ issue: unknown }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}/assign`,
    {
      method: "POST",
      body: JSON.stringify({ assigneeId }),
    },
  );
}

export async function updateLinearIssueStatus(
  config: LinearActionsConfig,
  issueId: string,
  stateId: string,
) {
  return apiRequest<{ issue: unknown }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}/status`,
    {
      method: "POST",
      body: JSON.stringify({ stateId }),
    },
  );
}

export async function linkLinearIssue(
  config: LinearActionsConfig,
  issueId: string,
  url: string,
  title?: string,
) {
  return apiRequest<{ attachment: unknown }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}/link`,
    {
      method: "POST",
      body: JSON.stringify({ url, title }),
    },
  );
}

export async function listLinearComments(config: LinearActionsConfig, issueId: string) {
  return apiRequest<{ comments: unknown[] }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}/comments`,
    { method: "GET" },
  );
}

export async function createLinearComment(
  config: LinearActionsConfig,
  issueId: string,
  body: string,
) {
  return apiRequest<{ comment: unknown }>(
    config,
    `/api/linear/tools/issues/${encodeURIComponent(issueId)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
