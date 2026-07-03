import type { LinearActionsConfig } from "./config.js";

export type LinearActionsAuth =
  | {
      kind?: "session";
      baseUrl: string;
      cookie: string;
      sessionToken: string;
      workflowRunId?: string;
    }
  | {
      kind: "cloud_worker";
      baseUrl: string;
      secret: string;
      organizationId: string;
      workflowRunId?: string;
    };

function isCloudWorkerAuth(
  auth: LinearActionsAuth,
): auth is Extract<LinearActionsAuth, { kind: "cloud_worker" }> {
  return auth.kind === "cloud_worker";
}

export function authHeaders(config: LinearActionsConfig): Record<string, string> {
  const auth = config.auth;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (auth.workflowRunId) {
    headers["x-workflow-run-id"] = auth.workflowRunId;
  }

  if (isCloudWorkerAuth(auth)) {
    return {
      ...headers,
      authorization: `Bearer ${auth.secret}`,
      "x-organization-id": auth.organizationId,
    };
  }

  return {
    ...headers,
    cookie: auth.cookie,
    authorization: `Bearer ${auth.sessionToken}`,
    "electron-origin": "openharness:/",
    "x-skip-oauth-proxy": "true",
  };
}
