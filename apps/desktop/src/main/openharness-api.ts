import { getAuthClient } from "./auth-client.js";
import { ELECTRON_AUTH_SCHEME, getApiBaseUrl, getAuthBaseUrl } from "./auth-config.js";
import type {
  CveVulnerability,
  SourceControlProviderId,
  WorkflowConfigSnapshot,
  WorkflowRunExecutionRecord,
  WorkflowRunResultPayload,
  WorkflowTools,
} from "@openharness/shared/workflow-run";

export type {
  CveVulnerability,
  SourceControlProviderId,
  WorkflowConfigSnapshot,
  WorkflowRunExecutionRecord,
  WorkflowRunResultPayload,
  WorkflowTools,
};

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
      connectionId?: string;
      owner: string;
      repo: string;
      fullName: string;
      githubRepoId: string;
      installationId: string;
      remoteUrl: string | null;
      projectPath?: string;
    };

export type GithubConnectResult = GithubProjectConnection & {
  warning?: string | null;
};

export type WorkflowTriggerEvent =
  | "pr_opened"
  | "pr_updated"
  | "pr_ready"
  | "pr_comment_on_diff"
  | "review_submitted";

export type WorkflowSchedulePreset = "hourly" | "daily" | "weekly";

export type WorkflowGitPrTrigger = {
  id: string;
  kind: "git_pr";
  event: WorkflowTriggerEvent;
  filters?: { commentAuthor?: "anyone" | "non_bot"; prAuthor?: "anyone" };
};

export type WorkflowTeamsMentionTrigger = {
  id: string;
  kind: "teams_mention";
};

export type WorkflowDiscordMentionTrigger = {
  id: string;
  kind: "discord_mention";
};

export type WorkflowScheduleTrigger = {
  id: string;
  kind: "schedule";
  preset?: WorkflowSchedulePreset;
  cronExpression: string;
  timezone: string;
  label?: string;
};

export type WorkflowTrigger =
  | WorkflowGitPrTrigger
  | WorkflowScheduleTrigger
  | WorkflowTeamsMentionTrigger
  | WorkflowDiscordMentionTrigger;

export type WorkflowRecord = {
  id: string;
  connectionId: string;
  userId: string;
  name: string;
  enabled: boolean;
  localOnly: boolean;
  executionTarget: "local" | "cloud" | "auto";
  model: string;
  instructions: string;
  targetBranch: string;
  triggers: WorkflowTrigger[];
  tools: WorkflowTools;
  fullName: string;
  owner: string;
  repo: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowTemplate = {
  id:
    | "pr_review"
    | "comment_fixer"
    | "dependency_cve_scan"
    | "discord_cve_scan"
    | "teams_bug_triage"
    | "discord_bug_triage"
    | "linear_issue_triage"
    | "linear_comment_triage"
    | "linear_issue_implementation"
    | "linear_implementation_plan"
    | "linear_plan_build";
  name: string;
  description: string;
  model: string;
  instructions: string;
  triggers: WorkflowRecord["triggers"];
  tools: WorkflowTools;
};

export type WorkflowRunSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerLabel: string;
  event: string;
  provider: string;
  prNumber: number;
  status: string;
  errorMessage: string | null;
  iteration: number;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  resolvedExecutor: "cloud" | "local";
  runnerKind: "desktop" | "cloud" | null;
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
};

export type WorkflowRunDetail = WorkflowRunSummary & {
  resultMarkdown: string | null;
  resultPayload: WorkflowRunResultPayload | null;
};

export type WorkflowsListResponse = {
  templates: WorkflowTemplate[];
  workflows: WorkflowRecord[];
};

/** @deprecated */
export type WorkflowType = "pr_review" | "comment_fixer";

/** @deprecated */
export type WorkflowInstance = WorkflowRecord;

/** @deprecated */
export type WorkflowDefinition = WorkflowTemplate;

/** @deprecated */
export type WorkflowSettingsResponse = WorkflowsListResponse;

export type WorkflowRunPayload = WorkflowRunExecutionRecord;

export type RunnerBindingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  runnerInstanceId: string;
  connectionId: string;
  projectPath: string;
  label: string | null;
  lastSeenAt: string | null;
  owner: string;
  repo: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

export type OrgRepoConnectionRecord = {
  id: string;
  organizationId: string;
  userId: string;
  provider?: SourceControlProviderId;
  githubOwner: string;
  githubRepo: string;
  githubRepoId: string;
  installationId: string;
  remoteUrl: string | null;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamsInstallationSummary = {
  id: string;
  tenantId: string;
  teamId: string;
  teamName: string;
  serviceUrl: string | null;
};

export type TeamsChannelRepoMapping = {
  id: string;
  installationId: string;
  teamId: string;
  channelId: string;
  channelName: string;
  githubOwner: string;
  githubRepo: string;
  conversationId: string | null;
  serviceUrl: string | null;
};

export type TeamsStatus = {
  configured: boolean;
  connected: boolean;
  installations: TeamsInstallationSummary[];
  mappings: TeamsChannelRepoMapping[];
};

export type TeamsTeamSummary = {
  installationId: string;
  teamId: string;
  teamName: string;
  tenantId: string;
};

export type TeamsChannelSummary = {
  id: string;
  displayName: string;
};

export type DiscordInstallationSummary = {
  id: string;
  guildId: string;
  guildName: string;
};

export type DiscordChannelRepoMapping = {
  id: string;
  installationId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  provider: string;
  namespace: string;
  repoName: string;
  githubOwner: string;
  githubRepo: string;
  threadId: string | null;
};

export type DiscordStatus = {
  configured: boolean;
  connected: boolean;
  installations: DiscordInstallationSummary[];
  mappings: DiscordChannelRepoMapping[];
};

export type DiscordGuildSummary = {
  installationId: string;
  guildId: string;
  guildName: string;
};

export type DiscordChannelSummary = {
  id: string;
  name: string;
  type: number;
};

export type PrContextComment = {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  reviewId?: string;
};

export type PrContextThread = {
  id: string;
  isResolved: boolean;
  path?: string;
  line?: number;
  comments: PrContextComment[];
};

export type PrContext = {
  provider: SourceControlProviderId;
  pullRequest: {
    number: number;
    title: string;
    body: string | null;
    url: string;
    headRef: string;
    headSha: string;
    baseRef: string;
    baseSha: string;
  };
  files: Array<{ path: string; patch?: string | null }>;
  diff: string;
  threads: PrContextThread[];
  issueComments: PrContextComment[];
};

function sourceControlPrPath(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  suffix = "",
): string {
  const base = `/api/source-control/pr/${provider}/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}`;
  return suffix ? `${base}/${suffix}` : base;
}

export type SessionDiagnostics = {
  request: {
    cookieNames: string[];
    hasBearer: boolean;
    bearerLength: number;
    origin: string | null;
    electronOrigin: string | null;
    userAgent: string | null;
  };
  cookieAuth: { session: { user: string; session: string } | null; error: string | null };
  bearerAuth: { session: { user: string; session: string } | null; error: string | null };
  middlewareResolvedUserId: string | null;
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

type AuthContext = {
  cookie: string;
  sessionToken: string;
};

let cachedAuthContext: (AuthContext & { expiresAt: number }) | null = null;
let authContextPromise: Promise<AuthContext> | null = null;
const AUTH_CACHE_TTL_MS = 60_000;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("aborted")))
  );
}

async function fetchAuthContextFromNetwork(): Promise<AuthContext> {
  const client = getAuthClient();
  const cookie = client.getCookie();
  if (!cookie) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  let response: Response;
  try {
    response = await fetch(`${getAuthBaseUrl()}/get-session`, {
      method: "GET",
      headers: authRequestHeaders(cookie),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new OpenHarnessApiError(
        "Could not reach the OpenHarness API. Make sure it is running and try again.",
        503,
        "network",
      );
    }
    throw err;
  }

  if (!response.ok) {
    throw new OpenHarnessApiError(`Session check failed (${response.status})`, response.status);
  }

  const sessionData = (await response.json().catch(() => null)) as {
    user?: { id: string } | null;
    session?: { token: string } | null;
  } | null;

  if (!sessionData?.user || !sessionData.session?.token) {
    throw new OpenHarnessApiError("Not signed in", 401, "unauthorized");
  }

  return {
    cookie,
    sessionToken: sessionData.session.token,
  };
}

async function createAuthenticatedRequestContext(): Promise<AuthContext> {
  if (cachedAuthContext && cachedAuthContext.expiresAt > Date.now()) {
    return {
      cookie: cachedAuthContext.cookie,
      sessionToken: cachedAuthContext.sessionToken,
    };
  }

  if (!authContextPromise) {
    authContextPromise = fetchAuthContextFromNetwork()
      .then((context) => {
        cachedAuthContext = {
          ...context,
          expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
        };
        return context;
      })
      .finally(() => {
        authContextPromise = null;
      });
  }

  return authContextPromise;
}

export function invalidateAuthContextCache(): void {
  cachedAuthContext = null;
}

export async function getExtensionApiAuth(): Promise<AuthContext & { baseUrl: string }> {
  const { cookie, sessionToken } = await createAuthenticatedRequestContext();
  return {
    cookie,
    sessionToken,
    baseUrl: getApiBaseUrl().replace(/\/$/, ""),
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

export async function fetchTeamsStatus(): Promise<TeamsStatus> {
  return apiRequest<TeamsStatus>("/api/teams/status");
}

export async function fetchTeamsConnectUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/api/teams/connect-url");
}

export async function listTeamsMappings(): Promise<{ mappings: TeamsChannelRepoMapping[] }> {
  return apiRequest("/api/teams/mappings");
}

export async function listTeamsForUser(): Promise<{ teams: TeamsTeamSummary[] }> {
  return apiRequest("/api/teams/teams");
}

export async function listTeamsChannels(
  teamId: string,
): Promise<{ channels: TeamsChannelSummary[] }> {
  return apiRequest(`/api/teams/teams/${encodeURIComponent(teamId)}/channels`);
}

export async function upsertTeamsMapping(options: {
  installationId: string;
  teamId: string;
  channelId: string;
  channelName: string;
  provider?: string;
  namespace?: string;
  repoName?: string;
  githubOwner: string;
  githubRepo: string;
}): Promise<{ ok: boolean; mapping: TeamsChannelRepoMapping }> {
  return apiRequest("/api/teams/mappings", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function deleteTeamsMapping(mappingId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/teams/mappings/${encodeURIComponent(mappingId)}`, {
    method: "DELETE",
  });
}

export async function fetchDiscordStatus(): Promise<DiscordStatus> {
  return apiRequest<DiscordStatus>("/api/discord/status");
}

export async function fetchDiscordConnectUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/api/discord/connect-url");
}

export async function listDiscordMappings(): Promise<{ mappings: DiscordChannelRepoMapping[] }> {
  return apiRequest("/api/discord/mappings");
}

export async function listDiscordGuilds(): Promise<{ guilds: DiscordGuildSummary[] }> {
  return apiRequest("/api/discord/guilds");
}

export async function listDiscordChannels(
  guildId: string,
): Promise<{ channels: DiscordChannelSummary[] }> {
  return apiRequest(`/api/discord/guilds/${encodeURIComponent(guildId)}/channels`);
}

export async function upsertDiscordMapping(options: {
  installationId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  provider?: string;
  namespace?: string;
  repoName?: string;
  githubOwner: string;
  githubRepo: string;
}): Promise<{ ok: boolean; mapping: DiscordChannelRepoMapping }> {
  return apiRequest("/api/discord/mappings", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function deleteDiscordMapping(mappingId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/discord/mappings/${encodeURIComponent(mappingId)}`, {
    method: "DELETE",
  });
}

export type LinearInstallationSummary = {
  id: string;
  organizationId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  webhookId: string | null;
  grantedScopes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinearProjectRepoMapping = {
  id: string;
  organizationId: string;
  userId: string;
  installationId: string;
  projectId: string;
  projectName: string;
  provider: string;
  namespace: string;
  repoName: string;
  githubOwner: string;
  githubRepo: string;
  projectSourceControlConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinearStatus = {
  configured: boolean;
  connected: boolean;
  installation: LinearInstallationSummary | null;
  mappings: LinearProjectRepoMapping[];
  agentReady?: boolean;
  cloudWorkersEnabled?: boolean;
  cloudInfraConfigured?: boolean;
};

export type LinearAgentConfigRow = {
  id: string;
  organizationId: string;
  mappingId: string;
  enabled: boolean;
  model: string;
  instructions: string;
  targetBranch: string;
  tools: WorkflowTools;
  projectId: string;
  projectName: string;
  provider: string;
  namespace: string;
  repoName: string;
  projectSourceControlConnectionId: string | null;
};

export type LinearAgentSessionSummary = {
  id: string;
  organizationId: string;
  mappingId: string | null;
  linearAgentSessionId: string;
  linearIssueId: string | null;
  issueIdentifier: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LinearAgentRunSummary = {
  id: string;
  issueIdentifier: string | null;
  trigger: string;
  status: string;
  namespace: string;
  repoName: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinearProjectSummary = {
  id: string;
  name: string;
  slugId?: string;
};

export async function fetchLinearStatus(): Promise<LinearStatus> {
  return apiRequest<LinearStatus>("/api/linear/status");
}

export async function fetchLinearConnectUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/api/linear/connect-url");
}

export async function deleteLinearInstallation(): Promise<{ ok: boolean }> {
  return apiRequest("/api/linear/installation", { method: "DELETE" });
}

export async function listLinearMappings(): Promise<{ mappings: LinearProjectRepoMapping[] }> {
  return apiRequest("/api/linear/mappings");
}

export async function listLinearProjects(): Promise<{ projects: LinearProjectSummary[] }> {
  return apiRequest("/api/linear/projects");
}

export async function upsertLinearMapping(options: {
  installationId: string;
  projectId: string;
  projectName: string;
  provider: string;
  namespace: string;
  repoName: string;
  projectSourceControlConnectionId?: string | null;
}): Promise<{ mapping: LinearProjectRepoMapping }> {
  return apiRequest("/api/linear/mappings", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function deleteLinearMapping(mappingId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/linear/mappings/${encodeURIComponent(mappingId)}`, {
    method: "DELETE",
  });
}

export async function fetchLinearAgentConfigs(): Promise<{
  configs: LinearAgentConfigRow[];
  agentReady: boolean;
  cloudWorkersEnabled: boolean;
  cloudInfraConfigured: boolean;
}> {
  return apiRequest("/api/linear/agent-configs");
}

export async function upsertLinearAgentConfig(
  mappingId: string,
  body: {
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch?: string;
    tools?: WorkflowTools;
  },
): Promise<{ config: LinearAgentConfigRow }> {
  return apiRequest(`/api/linear/agent-configs/${encodeURIComponent(mappingId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchLinearAgentSessions(): Promise<{
  sessions: LinearAgentSessionSummary[];
}> {
  return apiRequest("/api/linear/agent-sessions");
}

export async function fetchLinearAgentRuns(options?: {
  limit?: number;
}): Promise<{ runs: LinearAgentRunSummary[] }> {
  const params = new URLSearchParams();
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return apiRequest(`/api/linear/agent-runs${query ? `?${query}` : ""}`);
}

export async function fetchGithubConnection(
  projectPath: string,
  runnerInstanceId: string,
): Promise<GithubProjectConnection> {
  const params = new URLSearchParams({ projectPath, runnerInstanceId });
  return apiRequest<GithubProjectConnection>(`/api/github/connection?${params.toString()}`);
}

export async function connectGithubProject(options: {
  projectPath: string;
  owner: string;
  repo: string;
  remoteUrl?: string | null;
  runnerInstanceId: string;
  label?: string | null;
}): Promise<GithubConnectResult> {
  return apiRequest<GithubConnectResult>("/api/github/connection", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function disconnectGithubProject(
  projectPath: string,
  runnerInstanceId: string,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/api/github/connection", {
    method: "DELETE",
    body: JSON.stringify({ projectPath, runnerInstanceId }),
  });
}

export async function listOrgGithubConnections(): Promise<{
  connections: OrgRepoConnectionRecord[];
}> {
  return apiRequest("/api/github/connections");
}

export async function listRunnerBindings(options?: {
  runnerInstanceId?: string;
}): Promise<{ bindings: RunnerBindingRecord[] }> {
  const params = new URLSearchParams();
  if (options?.runnerInstanceId) {
    params.set("runnerInstanceId", options.runnerInstanceId);
  }
  const query = params.toString();
  return apiRequest(`/api/github/runner-bindings${query ? `?${query}` : ""}`);
}

export async function upsertRunnerBinding(options: {
  runnerInstanceId: string;
  connectionId: string;
  projectPath: string;
  label?: string | null;
}): Promise<{ ok: boolean; binding: RunnerBindingRecord }> {
  return apiRequest("/api/github/runner-bindings", {
    method: "PUT",
    body: JSON.stringify(options),
  });
}

export async function heartbeatRunnerBindings(options: {
  runnerInstanceId: string;
  label?: string | null;
}): Promise<{ ok: boolean }> {
  return apiRequest("/api/github/runner-bindings/heartbeat", {
    method: "POST",
    body: JSON.stringify(options),
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

export async function listRepoBranches(options: {
  owner: string;
  repo: string;
  provider?: "github" | "azure_devops";
}): Promise<{ defaultBranch: string; branches: string[] }> {
  if (options.provider === "azure_devops") {
    const params = new URLSearchParams({
      project: options.owner,
      repo: options.repo,
    });
    return apiRequest(`/api/azure-devops/branches?${params.toString()}`);
  }

  return apiRequest(
    `/api/github/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/branches`,
  );
}

export type AzureDevOpsStatus = {
  configured: boolean;
  connected: boolean;
  loginComplete: boolean;
  agentReady: boolean;
  connection: {
    connectionId: string;
    displayName: string;
    externalOrgId: string;
    repoCount: number;
  } | null;
};

export async function fetchAzureDevOpsStatus(): Promise<AzureDevOpsStatus> {
  return apiRequest<AzureDevOpsStatus>("/api/azure-devops/status");
}

export async function connectAzureDevOpsOrg(options: {
  orgName: string;
  pat: string;
}): Promise<{ ok: boolean; connectionId: string; displayName: string; repoCount: number }> {
  return apiRequest("/api/azure-devops/connect", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function disconnectAzureDevOpsOrg(): Promise<{ ok: boolean }> {
  return apiRequest("/api/azure-devops/disconnect", { method: "POST" });
}

export async function listAzureDevOpsRepos(options?: {
  q?: string;
  page?: number;
}): Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (options?.page) params.set("page", String(options.page));
  const query = params.toString();
  return apiRequest(`/api/azure-devops/repos${query ? `?${query}` : ""}`);
}

export async function connectAzureDevOpsProject(options: {
  projectPath: string;
  project: string;
  repo: string;
  remoteUrl?: string | null;
  runnerInstanceId: string;
}): Promise<GithubConnectResult> {
  return apiRequest<GithubConnectResult>("/api/azure-devops/connect-repo", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function connectSourceControlProject(options: {
  provider: "github" | "azure_devops";
  projectPath: string;
  owner: string;
  repo: string;
  remoteUrl?: string | null;
  runnerInstanceId: string;
  label?: string | null;
}): Promise<GithubConnectResult> {
  if (options.provider === "azure_devops") {
    return connectAzureDevOpsProject({
      projectPath: options.projectPath,
      project: options.owner,
      repo: options.repo,
      remoteUrl: options.remoteUrl,
      runnerInstanceId: options.runnerInstanceId,
    });
  }

  return connectGithubProject(options);
}

export async function listSourceControlRepos(
  provider: "github" | "azure_devops",
  options?: { q?: string; page?: number },
): Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }> {
  if (provider === "azure_devops") {
    return listAzureDevOpsRepos(options);
  }
  return listGithubRepos(options);
}


export async function listWorkflows(): Promise<WorkflowsListResponse> {
  return apiRequest("/api/github/workflows");
}

export async function fetchWorkflowSettings(): Promise<WorkflowsListResponse> {
  return listWorkflows();
}

export async function getWorkflow(workflowId: string): Promise<{ workflow: WorkflowRecord }> {
  return apiRequest(`/api/github/workflows/${workflowId}`);
}

export async function createWorkflow(options: {
  connectionId?: string;
  owner?: string;
  repo?: string;
  remoteUrl?: string | null;
  name?: string;
  enabled?: boolean;
  localOnly?: boolean;
  executionTarget?: WorkflowRecord["executionTarget"];
  model?: string;
  instructions?: string;
  targetBranch: string;
  triggers?: WorkflowRecord["triggers"];
  tools?: WorkflowTools;
}): Promise<{ ok: boolean; warning?: string | null; workflow: WorkflowRecord }> {
  return apiRequest("/api/github/workflows", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function updateWorkflow(
  workflowId: string,
  options: Partial<{
    connectionId: string;
    owner: string;
    repo: string;
    remoteUrl: string | null;
    name: string;
    enabled: boolean;
    localOnly: boolean;
    executionTarget: WorkflowRecord["executionTarget"];
    model: string;
    instructions: string;
    targetBranch: string;
    triggers: WorkflowRecord["triggers"];
    tools: WorkflowTools;
  }>,
): Promise<{ ok: boolean; workflow: WorkflowRecord }> {
  return apiRequest(`/api/github/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify(options),
  });
}

export async function deleteWorkflow(workflowId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/github/workflows/${workflowId}`, { method: "DELETE" });
}

export async function triggerWorkflowRun(
  workflowId: string,
): Promise<{ ok: boolean; runId: string }> {
  return apiRequest(`/api/github/workflows/${workflowId}/run`, {
    method: "POST",
  });
}

export async function listWorkflowRuns(options?: {
  workflowId?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ runs: WorkflowRunSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (options?.workflowId) params.set("workflowId", options.workflowId);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return apiRequest(`/api/workflow-runs${query ? `?${query}` : ""}`);
}

export async function getWorkflowRun(runId: string): Promise<{ run: WorkflowRunDetail }> {
  return apiRequest(`/api/workflow-runs/${encodeURIComponent(runId)}`);
}

export async function fetchWorkflowRunForExecution(
  runId: string,
): Promise<{ run: WorkflowRunExecutionRecord }> {
  return apiRequest(`/api/workflow-runs/${encodeURIComponent(runId)}/execution`);
}

export type WorkflowRunEventRecord = {
  seq: number;
  event: unknown;
  createdAt: string;
};

export async function listWorkflowRunEvents(
  runId: string,
  options?: { afterSeq?: number; limit?: number },
): Promise<{ events: WorkflowRunEventRecord[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.afterSeq !== undefined) params.set("afterSeq", String(options.afterSeq));
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiRequest(
    `/api/workflow-runs/${encodeURIComponent(runId)}/events${query ? `?${query}` : ""}`,
  );
}

export async function appendWorkflowRunEvents(
  runId: string,
  events: unknown[],
): Promise<{ appended: number; lastSeq: number | null }> {
  return apiRequest(`/api/workflow-runs/${encodeURIComponent(runId)}/events`, {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export async function dismissWorkflowRun(
  runId: string,
  options?: { reason?: string },
): Promise<{ run: WorkflowRunDetail }> {
  return apiRequest(`/api/workflow-runs/${encodeURIComponent(runId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify(options?.reason ? { reason: options.reason } : {}),
  });
}

export async function getWorkflowRunStats(
  workflowId?: string,
): Promise<{ stats: WorkflowRunStats }> {
  const params = new URLSearchParams();
  if (workflowId) params.set("workflowId", workflowId);
  const query = params.toString();
  return apiRequest(`/api/workflow-runs/stats${query ? `?${query}` : ""}`);
}

export async function claimWorkflowRun(
  runId: string,
  claimedBy: string,
  runnerInstanceId: string,
): Promise<{ run: Record<string, unknown> }> {
  return apiRequest(`/api/workflow-runs/${runId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimedBy, runnerInstanceId }),
  });
}

export async function updateWorkflowRunStatus(
  runId: string,
  status: "running" | "done" | "failed",
  options?: {
    errorMessage?: string;
    iteration?: number;
    resultMarkdown?: string;
    resultPayload?: WorkflowRunResultPayload | null;
  },
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/workflow-runs/${runId}/status`, {
    method: "POST",
    body: JSON.stringify({ status, ...options }),
  });
}

export async function fetchPrContext(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
): Promise<PrContext> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, `${number}/context`));
}

export async function postPrReview(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
  body: {
    event: "APPROVE" | "COMMENT";
    body: string;
    commitId?: string;
    comments?: Array<{ path: string; line: number; body: string; side?: "RIGHT" | "LEFT" }>;
  },
): Promise<unknown> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, `${number}/review`), {
    method: "POST",
    body: JSON.stringify({
      event: body.event,
      body: body.body,
      commit_id: body.commitId,
      comments: body.comments,
    }),
  });
}

export async function postPrReviewComment(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
  body: {
    commitId: string;
    path: string;
    line: number;
    body: string;
    side?: "RIGHT" | "LEFT";
  },
): Promise<unknown> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, `${number}/inline-comments`), {
    method: "POST",
    body: JSON.stringify({
      body: body.body,
      commit_id: body.commitId,
      path: body.path,
      line: body.line,
      side: body.side ?? "RIGHT",
    }),
  });
}

export async function replyToReviewComment(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
  threadOrCommentId: string,
  body: string,
): Promise<unknown> {
  return apiRequest(
    sourceControlPrPath(provider, namespace, repo, `${number}/threads/${threadOrCommentId}/reply`),
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}

export async function postIssueComment(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
  body: string,
): Promise<unknown> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, `${number}/issue-comments`), {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function resolveReviewThread(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  number: number,
  threadId: string,
): Promise<{ ok: boolean }> {
  return apiRequest(
    sourceControlPrPath(provider, namespace, repo, `${number}/threads/${threadId}/resolve`),
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function fetchGitCredentials(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
): Promise<{ username: string; token: string; remoteUrl: string }> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, "git-credentials"));
}

export async function createPullRequest(
  provider: SourceControlProviderId,
  namespace: string,
  repo: string,
  body: {
    title: string;
    body: string;
    head: string;
    base?: string;
  },
): Promise<{
  pull: {
    number: number;
    title: string;
    url: string;
    headRef: string;
    baseRef: string;
  };
}> {
  return apiRequest(sourceControlPrPath(provider, namespace, repo, "pulls"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPendingWorkflowRuns(
  runnerInstanceId: string,
): Promise<{ runs: Array<WorkflowRunPayload & { id: string }> }> {
  const params = new URLSearchParams({ runnerInstanceId });
  return apiRequest(`/api/workflow-runs/pending?${params.toString()}`);
}

export async function fetchActiveWorkflowRunsForRunner(
  runnerInstanceId: string,
): Promise<{ runs: Array<{ id: string; status: string }> }> {
  const params = new URLSearchParams({ runnerInstanceId });
  return apiRequest(`/api/workflow-runs/active?${params.toString()}`);
}

/**
 * Calls /api/debug/session with the same auth headers the GitHub calls use,
 * so the user can see exactly what the server sees.
 */
export async function fetchSessionDiagnostics(): Promise<{
  apiBaseUrl: string;
  hasCookie: boolean;
  diagnostics: SessionDiagnostics | { error: string; status: number };
}> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const client = getAuthClient();
  const cookie = client.getCookie();
  const hasCookie = Boolean(cookie);

  if (!hasCookie) {
    return {
      apiBaseUrl: baseUrl,
      hasCookie: false,
      diagnostics: { error: "Electron auth client has no stored cookie", status: 0 },
    };
  }

  let sessionToken: string | undefined;
  try {
    const context = await createAuthenticatedRequestContext();
    sessionToken = context.sessionToken;
  } catch {
    sessionToken = undefined;
  }

  const response = await fetch(`${baseUrl}/api/debug/session`, {
    method: "GET",
    headers: authRequestHeaders(cookie, sessionToken),
  });

  const data = (await response.json().catch(() => null)) as SessionDiagnostics | null;
  if (!data) {
    return {
      apiBaseUrl: baseUrl,
      hasCookie,
      diagnostics: { error: `Diagnostics endpoint failed (${response.status})`, status: response.status },
    };
  }

  return { apiBaseUrl: baseUrl, hasCookie, diagnostics: data };
}

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  cloudWorkersEnabled: boolean;
};

export type OrgMembershipSummary = {
  id: string;
  role: string;
};

export type OrgMember = {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
};

export async function fetchOrganization(): Promise<{
  organization: OrganizationSummary;
  membership: OrgMembershipSummary;
}> {
  return apiRequest("/api/org");
}

export async function listOrgMembers(): Promise<{ members: OrgMember[] }> {
  return apiRequest("/api/org/members");
}

export async function fetchOrgCanManage(): Promise<{ canManage: boolean }> {
  return apiRequest("/api/org/can-manage");
}

async function authOrganizationRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { cookie, sessionToken } = await createAuthenticatedRequestContext();
  const response = await fetch(`${getAuthBaseUrl()}${path}`, {
    method: "POST",
    headers: authRequestHeaders(cookie, sessionToken),
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;
  if (!response.ok) {
    const message =
      (data && typeof data === "object" && ("message" in data ? data.message : data.error)) ||
      `Request failed (${response.status})`;
    throw new OpenHarnessApiError(String(message), response.status);
  }
  return data as T;
}

export async function fetchOrgOnboardingStatus(): Promise<{ hasOrganization: boolean }> {
  return apiRequest("/api/org/onboarding/status");
}

export async function createOrganizationOnboarding(name: string): Promise<{
  organization: OrganizationSummary;
  membership: OrgMembershipSummary;
}> {
  return apiRequest("/api/org/onboarding/create", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinOrganizationWithCode(code: string): Promise<{
  organization: OrganizationSummary;
  membership: OrgMembershipSummary;
}> {
  return apiRequest("/api/org/onboarding/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchOrgInviteCode(): Promise<{ code: string; formatted: string }> {
  return apiRequest("/api/org/invite-code");
}

export async function regenerateOrgInviteCode(): Promise<{ code: string; formatted: string }> {
  return apiRequest("/api/org/invite-code/regenerate", { method: "POST" });
}

export async function updateOrgMemberRole(
  memberId: string,
  role: "member" | "admin" | "owner",
): Promise<void> {
  await authOrganizationRequest("/organization/update-member-role", { memberId, role });
}

export async function removeOrgMember(memberId: string): Promise<void> {
  await authOrganizationRequest("/organization/remove-member", { memberId });
}

export async function updateOrganization(options: {
  name?: string;
  cloudWorkersEnabled?: boolean;
}): Promise<void> {
  await apiRequest("/api/org", {
    method: "PATCH",
    body: JSON.stringify(options),
  });
}

export type OrgSecretSlotStatus = {
  slot: string;
  displayName: string;
  configured: boolean;
  maskedHint?: string;
  updatedAt?: string;
};

export async function fetchOrgSecrets(): Promise<{ slots: OrgSecretSlotStatus[] }> {
  return apiRequest("/api/org/secrets");
}

export async function upsertOrgSecret(
  slot: string,
  value: string,
): Promise<{ slot: OrgSecretSlotStatus }> {
  return apiRequest(`/api/org/secrets/${encodeURIComponent(slot)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function deleteOrgSecret(slot: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/org/secrets/${encodeURIComponent(slot)}`, {
    method: "DELETE",
  });
}

export async function resolveOrgSecrets(): Promise<{
  secrets: Array<{ slot: string; value: string }>;
}> {
  return apiRequest("/api/org/secrets/resolve");
}

export type RepoEnvironmentSummary = {
  connectionId: string;
  provider: string;
  namespace: string;
  repoName: string;
  fullName: string;
  variableCount: number;
};

export type RepoEnvironmentVariable = {
  key: string;
  isSecret: boolean;
  value?: string;
  maskedHint?: string;
  description: string | null;
  updatedAt: string;
};

export async function listRepoEnvironments(): Promise<{ repos: RepoEnvironmentSummary[] }> {
  return apiRequest("/api/repo-environments");
}

export async function listRepoEnvironmentVariables(
  connectionId: string,
): Promise<{ variables: RepoEnvironmentVariable[] }> {
  return apiRequest(`/api/repo-environments/${encodeURIComponent(connectionId)}`);
}

export async function resolveRepoEnvironmentVariables(
  connectionId: string,
): Promise<{ vars: Record<string, string> }> {
  return apiRequest(`/api/repo-environments/${encodeURIComponent(connectionId)}/resolved`);
}

export async function upsertRepoEnvironmentVariable(options: {
  connectionId: string;
  key: string;
  value: string;
  isSecret: boolean;
  description?: string | null;
}): Promise<{ variable: RepoEnvironmentVariable }> {
  return apiRequest(
    `/api/repo-environments/${encodeURIComponent(options.connectionId)}/${encodeURIComponent(options.key)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        value: options.value,
        isSecret: options.isSecret,
        description: options.description ?? null,
      }),
    },
  );
}

export async function deleteRepoEnvironmentVariable(options: {
  connectionId: string;
  key: string;
}): Promise<{ ok: boolean }> {
  return apiRequest(
    `/api/repo-environments/${encodeURIComponent(options.connectionId)}/${encodeURIComponent(options.key)}`,
    { method: "DELETE" },
  );
}
