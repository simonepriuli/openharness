import type { WorkflowTools } from "@openharness/shared/workflow-run";
import type { GitCredentials, WorkflowEventSink, WorkflowPiRunner } from "../deps.js";
import type { LinearAgentRunExecutionRecord } from "../linear-agent/linear-agent-run.js";

type FetchFn = typeof fetch;

export type LinearAgentActivityContent =
  | { type: "thought"; body: string }
  | { type: "action"; action: string; parameter?: string; result?: string }
  | { type: "response"; body: string }
  | { type: "error"; body: string };

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
  emitActivity(
    runId: string,
    content: LinearAgentActivityContent,
    ephemeral?: boolean,
  ): Promise<void>;
  completeRunWorkspace(
    runId: string,
    fields: {
      worktreePath?: string | null;
      workBranch?: string | null;
      piAgentDir?: string | null;
      piSessionPath?: string | null;
      success?: boolean;
    },
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
  workspaceMode?: string;
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
      if (options.workspaceMode?.trim()) {
        params.set("workspaceMode", options.workspaceMode.trim());
      }
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

    async emitActivity(runId, content, ephemeral) {
      await request(`/api/internal/linear-agent-runs/${encodeURIComponent(runId)}/activities`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: options.organizationId,
          content,
          ephemeral: ephemeral === true,
        }),
      });
    },

    async completeRunWorkspace(runId, fields) {
      await request(
        `/api/internal/linear-agent-runs/${encodeURIComponent(runId)}/workspace/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            organizationId: options.organizationId,
            ...fields,
          }),
        },
      );
    },

    async fetchGitCredentials(provider, namespace, repoName) {
      if (provider !== "github") {
        throw new Error(
          `Cloud worker git credentials are only supported for GitHub (${provider})`,
        );
      }
      const params = new URLSearchParams({ organizationId: options.organizationId });
      return request<GitCredentials>(
        `/api/internal/source-control/pr/github/${encodeURIComponent(namespace)}/${encodeURIComponent(repoName)}/git-credentials?${params.toString()}`,
      );
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

export async function listActiveLinearAgentRunsForWorker(options: {
  baseUrl: string;
  secret: string;
  runnerInstanceId: string;
  fetchImpl?: FetchFn;
}): Promise<Array<{ id: string; organizationId: string; status: string }>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({ runnerInstanceId: options.runnerInstanceId });
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/linear-agent-runs/active?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${options.secret}` },
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { runs?: Array<{ id: string; organizationId: string; status: string }> }
    | { error?: string };
  if (!response.ok) {
    throw new Error(body && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed (${response.status})`);
  }
  return body && "runs" in body && Array.isArray(body.runs) ? body.runs : [];
}

export async function appendInternalLinearAgentRunEvents(options: {
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
    `${options.baseUrl.replace(/\/$/, "")}/api/internal/linear-agent-runs/${encodeURIComponent(options.runId)}/events`,
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
    }) => Promise<{ worktreePath: string; branchName: string }>;
    resumeBranchWorktree?: (options: {
      worktreePath: string;
      repoCwd: string;
      worktreesRoot: string;
      owner: string;
      repo: string;
      branch: string;
      credentials: GitCredentials;
    }) => Promise<{ worktreePath: string; branchName: string }>;
  };
  pi: WorkflowPiRunner;
  events?: WorkflowEventSink;
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
