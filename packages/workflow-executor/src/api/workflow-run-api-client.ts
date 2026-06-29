import type {
  SourceControlProviderId,
  WorkflowRunExecutionRecord,
  WorkflowRunResultPayload,
} from "@openharness/shared/workflow-run";
import type {
  GitCredentials,
  PrContext,
  WorkflowRunApiClient,
  WorkflowRunExecutionContext,
  WorkflowStatusUpdateFields,
} from "../deps.js";
import { extractWorkflowConfig } from "../helpers/run-repo.js";

type FetchFn = typeof fetch;

function mapExecutionRun(row: Record<string, unknown>): WorkflowRunExecutionRecord {
  return {
    id: String(row.id),
    workflowId: typeof row.workflowId === "string" ? row.workflowId : null,
    workflowType: typeof row.workflowType === "string" ? row.workflowType : null,
    projectSourceControlConnectionId:
      typeof row.projectSourceControlConnectionId === "string"
        ? row.projectSourceControlConnectionId
        : undefined,
    projectPath: typeof row.projectPath === "string" ? row.projectPath : null,
    provider: row.provider === "azure_devops" ? "azure_devops" : "github",
    namespace: typeof row.namespace === "string" ? row.namespace : undefined,
    repoName: typeof row.repoName === "string" ? row.repoName : undefined,
    githubOwner:
      typeof row.githubOwner === "string"
        ? row.githubOwner
        : typeof row.namespace === "string"
          ? row.namespace
          : "",
    githubRepo:
      typeof row.githubRepo === "string"
        ? row.githubRepo
        : typeof row.repoName === "string"
          ? row.repoName
          : "",
    prNumber: typeof row.prNumber === "number" ? row.prNumber : 0,
    event: typeof row.event === "string" ? row.event : "",
    iteration: typeof row.iteration === "number" ? row.iteration : 1,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}

export function createInternalWorkflowRunApiClient(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  fetchImpl?: FetchFn;
}): WorkflowRunApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authHeader = `Bearer ${options.secret}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: authHeader,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = (await response.json().catch(() => null)) as T | { error?: string };
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `Request failed (${response.status})`;
      throw new Error(message);
    }
    return body as T;
  }

  return {
    async getRun(runId: string): Promise<WorkflowRunExecutionContext> {
      const params = new URLSearchParams({ organizationId: options.organizationId });
      const data = await request<{ run: Record<string, unknown> }>(
        `/api/internal/workflow-runs/${encodeURIComponent(runId)}?${params.toString()}`,
      );
      const run = mapExecutionRun(data.run);
      return {
        run,
        workflowConfig: extractWorkflowConfig(run),
      };
    },

    async updateStatus(
      runId: string,
      status: "running" | "done" | "failed",
      fields?: WorkflowStatusUpdateFields,
    ): Promise<void> {
      await request(`/api/internal/workflow-runs/${encodeURIComponent(runId)}/status`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: options.organizationId,
          status,
          ...fields,
        }),
      });
    },

    async fetchPrContext(
      provider: SourceControlProviderId,
      namespace: string,
      repo: string,
      prNumber: number,
    ): Promise<PrContext> {
      if (provider !== "github") {
        throw new Error(`Cloud worker PR context is only supported for GitHub (${provider})`);
      }
      const params = new URLSearchParams({ organizationId: options.organizationId });
      return request<PrContext>(
        `/api/internal/source-control/pr/github/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}/${prNumber}/context?${params.toString()}`,
      );
    },

    async fetchGitCredentials(
      provider: SourceControlProviderId,
      namespace: string,
      repo: string,
    ): Promise<GitCredentials> {
      if (provider !== "github") {
        throw new Error(`Cloud worker git credentials are only supported for GitHub (${provider})`);
      }
      const params = new URLSearchParams({ organizationId: options.organizationId });
      return request<GitCredentials>(
        `/api/internal/source-control/pr/github/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}/git-credentials?${params.toString()}`,
      );
    },
  };
}

export type SessionWorkflowRunApiClientOptions = {
  getRunForExecution: (runId: string) => Promise<{ run: WorkflowRunExecutionRecord }>;
  updateWorkflowRunStatus: (
    runId: string,
    status: "running" | "done" | "failed",
    fields?: WorkflowStatusUpdateFields,
  ) => Promise<unknown>;
  fetchPrContext: (
    provider: SourceControlProviderId,
    namespace: string,
    repo: string,
    prNumber: number,
  ) => Promise<PrContext>;
  fetchGitCredentials: (
    provider: SourceControlProviderId,
    namespace: string,
    repo: string,
  ) => Promise<GitCredentials>;
};

export function createSessionWorkflowRunApiClient(
  options: SessionWorkflowRunApiClientOptions,
): WorkflowRunApiClient {
  return {
    async getRun(runId: string): Promise<WorkflowRunExecutionContext> {
      const data = await options.getRunForExecution(runId);
      return {
        run: data.run,
        workflowConfig: extractWorkflowConfig(data.run),
      };
    },
    updateStatus: async (runId, status, fields) => {
      await options.updateWorkflowRunStatus(runId, status, fields);
    },
    fetchPrContext: options.fetchPrContext,
    fetchGitCredentials: options.fetchGitCredentials,
  };
}

export async function resolveRepoEnvironmentVariables(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  connectionId: string;
  fetchImpl?: FetchFn;
}): Promise<Record<string, string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/repo-environments/resolve`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: options.organizationId,
        connectionId: options.connectionId,
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { vars?: Record<string, string> }
    | { error?: string };
  if (!response.ok) {
    const message =
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body && "vars" in body && body.vars ? body.vars : {};
}

export type ResolvedOrgSecret = {
  slot: string;
  value: string;
};

export async function resolveOrgSecretsInternal(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  fetchImpl?: FetchFn;
}): Promise<ResolvedOrgSecret[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/org-secrets/resolve`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ organizationId: options.organizationId }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { secrets?: ResolvedOrgSecret[] }
    | { error?: string };
  if (!response.ok) {
    const message =
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body && "secrets" in body && Array.isArray(body.secrets) ? body.secrets : [];
}

export type PendingCloudWorkflowRun = {
  id: string;
  organizationId: string;
  workflowId: string | null;
  workflowType: string | null;
  projectSourceControlConnectionId: string | null;
  provider: string;
  namespace: string;
  repoName: string;
  prNumber: number;
  event: string;
  iteration: number;
  payload: unknown;
  resolvedExecutor: string | null;
  createdAt: string | Date;
};

export async function fetchPendingCloudRuns(options: {
  baseUrl: string;
  secret: string;
  organizationId?: string;
  fetchImpl?: FetchFn;
}): Promise<PendingCloudWorkflowRun[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = options.organizationId
    ? `?${new URLSearchParams({ organizationId: options.organizationId }).toString()}`
    : "";
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/workflow-runs/pending${params}`,
    {
      headers: { authorization: `Bearer ${options.secret}` },
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { runs?: PendingCloudWorkflowRun[] }
    | { error?: string };
  if (!response.ok) {
    const message =
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body && "runs" in body && Array.isArray(body.runs) ? body.runs : [];
}

export async function claimCloudWorkflowRunInternal(options: {
  baseUrl: string;
  secret: string;
  runId: string;
  organizationId: string;
  claimedBy: string;
  runnerInstanceId: string;
  fetchImpl?: FetchFn;
}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/workflow-runs/${encodeURIComponent(options.runId)}/claim`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: options.organizationId,
        claimedBy: options.claimedBy,
        runnerInstanceId: options.runnerInstanceId,
      }),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export async function appendInternalWorkflowRunEvents(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  runId: string;
  events: unknown[];
  fetchImpl?: FetchFn;
}): Promise<void> {
  if (options.events.length === 0) return;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/workflow-runs/${encodeURIComponent(options.runId)}/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: options.organizationId,
        events: options.events,
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = body?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
}

export async function listActiveCloudRunsForWorker(options: {
  baseUrl: string;
  secret: string;
  runnerInstanceId: string;
  fetchImpl?: FetchFn;
}): Promise<Array<{ id: string; organizationId: string; status: string }>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({ runnerInstanceId: options.runnerInstanceId });
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/workflow-runs/active?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${options.secret}` },
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { runs?: Array<{ id: string; organizationId: string; status: string }> }
    | { error?: string };
  if (!response.ok) {
    const message =
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body && "runs" in body && Array.isArray(body.runs) ? body.runs : [];
}

export type { WorkflowRunResultPayload };
