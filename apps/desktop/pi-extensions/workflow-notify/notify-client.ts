import type { WorkflowNotifyConfig } from "./config.js";
import { authHeaders } from "./auth.js";

type ApiErrorBody = { error?: string; message?: string };

async function apiRequest<T>(
  config: WorkflowNotifyConfig,
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

export async function postDiscordMessage(
  config: WorkflowNotifyConfig,
  summary: string,
): Promise<void> {
  await apiRequest(config, `/api/workflow-runs/${encodeURIComponent(config.runId)}/notify/discord`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

export async function postTeamsMessage(
  config: WorkflowNotifyConfig,
  summary: string,
): Promise<void> {
  await apiRequest(config, `/api/workflow-runs/${encodeURIComponent(config.runId)}/notify/teams`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}
