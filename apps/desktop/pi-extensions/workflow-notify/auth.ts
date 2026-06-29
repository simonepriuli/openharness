import type { WorkflowNotifyConfig } from "./config.js";

export type WorkflowNotifyAuth =
  | {
      kind?: "session";
      baseUrl: string;
      cookie: string;
      sessionToken: string;
    }
  | {
      kind: "cloud_worker";
      baseUrl: string;
      secret: string;
      organizationId: string;
    };

function isCloudWorkerAuth(
  auth: WorkflowNotifyAuth,
): auth is Extract<WorkflowNotifyAuth, { kind: "cloud_worker" }> {
  return auth.kind === "cloud_worker";
}

export function authHeaders(config: WorkflowNotifyConfig): Record<string, string> {
  const auth = config.auth;
  if (isCloudWorkerAuth(auth)) {
    return {
      authorization: `Bearer ${auth.secret}`,
      "x-organization-id": auth.organizationId,
      "content-type": "application/json",
    };
  }

  return {
    cookie: auth.cookie,
    authorization: `Bearer ${auth.sessionToken}`,
    "content-type": "application/json",
    "electron-origin": "openharness:/",
    "x-skip-oauth-proxy": "true",
  };
}
