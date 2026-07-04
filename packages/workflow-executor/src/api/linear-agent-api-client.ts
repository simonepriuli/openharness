import type { WorkflowTools } from "@openharness/shared/workflow-run";
import type { GitCredentials, WorkflowPiRunner } from "../deps.js";
import type { LinearAgentRunExecutionRecord } from "../linear-agent/linear-agent-run.js";

type FetchFn = typeof fetch;

export type LinearAgentStatusUpdateFields = {
  errorMessage?: string;
  resultMarkdown?: string;
};

export type LinearAgentRunApiClient = {
  getRun(runId: string): Promise<{ run: LinearAgentRunExecutionRecord }>;
  updateStatus(
    runId: string,
    status: "running" | "done" | "failed",
    fields?: LinearAgentStatusUpdateFields,
  ): Promise<void>;
  fetchGitCredentials(
    provider: "github" | "azure_devops",
    namespace: string,
    repoName: string,
  ): Promise<GitCredentials>;
};

export function createInternalLinearAgentRunApiClient(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  sandboxName?: string;
  fetchImpl?: FetchFn;
}): LinearAgentRunApiClient {
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
    async getRun(runId) {
      const params = new URLSearchParams({ organizationId: options.organizationId });
      return request<{ run: LinearAgentRunExecutionRecord }>(
        `/api/internal/linear-agent-runs/${encodeURIComponent(runId)}?${params.toString()}`,
      );
    },

    async updateStatus(runId, status, fields) {
      await request(`/api/internal/linear-agent-runs/${encodeURIComponent(runId)}/status`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: options.organizationId,
          status,
          sandboxName: options.sandboxName,
          ...fields,
        }),
      });
    },

    async fetchGitCredentials(provider, namespace, repoName) {
      const params = new URLSearchParams({
        organizationId: options.organizationId,
        provider,
        namespace,
        repoName,
      });
      const data = await request<{ credentials: GitCredentials }>(
        `/api/internal/source-control/git-credentials?${params.toString()}`,
      );
      return data.credentials;
    },
  };
}

export type PendingLinearAgentRun = LinearAgentRunExecutionRecord & {
  organizationId: string;
};

export async function fetchPendingLinearAgentRuns(options: {
  baseUrl: string;
  secret: string;
  organizationId?: string;
  fetchImpl?: FetchFn;
}): Promise<PendingLinearAgentRun[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  if (options.organizationId) {
    params.set("organizationId", options.organizationId);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/linear-agent-runs/pending${suffix}`,
    {
      headers: { authorization: `Bearer ${options.secret}` },
    },
  );
  const body = (await response.json().catch(() => null)) as {
    runs?: PendingLinearAgentRun[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body.runs ?? [];
}

export async function claimLinearAgentRunInternal(options: {
  baseUrl: string;
  secret: string;
  runId: string;
  organizationId: string;
  claimedBy: string;
  runnerInstanceId: string;
  fetchImpl?: FetchFn;
}): Promise<PendingLinearAgentRun | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/linear-agent-runs/${encodeURIComponent(options.runId)}/claim`,
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
  if (response.status === 409) return null;
  const body = (await response.json().catch(() => null)) as {
    run?: PendingLinearAgentRun;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body.run ?? null;
}

export type LinearAgentExecutorDeps = {
  api: LinearAgentRunApiClient;
  git: {
    prepareBranchWorktree: (options: {
      repoCwd: string;
      worktreesRoot: string;
      owner: string;
      repo: string;
      branch: string;
      credentials: GitCredentials;
    }) => Promise<{ worktreePath: string }>;
  };
  pi: WorkflowPiRunner;
  secrets: {
    buildLinearActionsEnv?: (
      run: LinearAgentRunExecutionRecord,
      tools: WorkflowTools,
      runId: string,
    ) => Promise<NodeJS.ProcessEnv>;
    buildGithubActionsEnv?: (
      run: LinearAgentRunExecutionRecord,
      tools: WorkflowTools,
    ) => Promise<NodeJS.ProcessEnv>;
    resolveSummarizationModelRef?: () => string | null;
    buildPiProcessEnv?: (worktreePath: string) => Promise<NodeJS.ProcessEnv>;
  };
};
