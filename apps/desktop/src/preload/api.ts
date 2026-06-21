export interface HarnessStatus {
  running: boolean;
  cwd: string | null;
}

export interface TokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface TokenUsageTotals {
  allTime: TokenStats;
  monthly: TokenStats;
  monthKey: string;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
  tokenStats?: TokenStats;
  cost?: number;
}

export interface SessionStats {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: ContextUsage;
}

export interface HarnessState {
  model: unknown | null;
  thinkingLevel?: string;
  swarmMode?: boolean;
  isStreaming: boolean;
  isCompacting?: boolean;
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  messageCount?: number;
  pendingMessageCount?: number;
}

export interface HarnessResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ProjectFile {
  relativePath: string;
}

export type { SlashMenuItem, ToolInvocation } from "../shared/thread-tools";

export interface ProjectSummary {
  cwd: string;
  name: string;
  conversationCount: number;
  lastActivityAt: string | null;
}

export interface ConversationSummary {
  sessionId: string;
  sessionFile: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source?: "github-workflow";
}

export interface HarnessEventEnvelope {
  sessionKey: string;
  event: unknown;
}

export interface HarnessImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ExtensionUiResponseOptions {
  sessionKey: string;
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: true;
}

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ModelThinkingLevelMap = Partial<
  Record<ThinkingLevel, string | null>
>;

export interface HarnessModelInfo {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  thinkingLevelMap?: ModelThinkingLevelMap;
}

export interface OpenRouterAuthStatus {
  configured: boolean;
  maskedHint?: string;
}

export interface OpenRouterManagementStatus {
  configured: boolean;
  maskedHint?: string;
}

export type ExaAuthSource = "stored" | "environment";

export interface ExaStatus {
  configured: boolean;
  maskedHint?: string;
  source?: ExaAuthSource;
  envVar?: string;
}

export type OpenRouterAccountCreditsResult =
  | { status: "not_configured" }
  | { status: "invalid_key" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      totalCredits: number;
      totalUsage: number;
      creditsRemaining: number;
      monthlySpent?: number;
    };

export interface GitLineStatsAggregate {
  files: number;
  linesAdded: number;
  linesRemoved: number;
}

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
  error?: string;
};

export type SessionDiagnostics = {
  apiBaseUrl: string;
  hasCookie: boolean;
  diagnostics:
    | {
        request: {
          cookieNames: string[];
          hasBearer: boolean;
          bearerLength: number;
          origin: string | null;
          electronOrigin: string | null;
          userAgent: string | null;
        };
        cookieAuth: {
          session: { user: string; session: string } | null;
          error: string | null;
        };
        bearerAuth: {
          session: { user: string; session: string } | null;
          error: string | null;
        };
        middlewareResolvedUserId: string | null;
      }
    | { error: string; status: number };
};

export type GitRemoteInfo = {
  isGitRepo: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
};

export type GithubRepoSummary = {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  installationId: string;
};

export type GithubProjectConnection =
  | { connected: false; error?: string }
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

export type AppTheme = "system" | "light" | "dark";

export type SettingsMenuSection =
  | "general"
  | "chat"
  | "cloud-providers"
  | "local-providers"
  | "web-search"
  | "swarm"
  | "integrations";

export type LocalProviderPreset = "lmstudio" | "ollama" | "apicursor" | "custom";

export type LocalModelEntry = {
  id: string;
  name?: string;
  enabled: boolean;
};

export type LocalProviderConfig = {
  preset: LocalProviderPreset;
  enabled: boolean;
  baseUrl: string;
  providerId?: string;
  serverApiKey?: string;
  models: LocalModelEntry[];
};

export type LocalProvidersState = {
  providers: LocalProviderConfig[];
  modelsJsonPath: string;
  parseError?: string;
};

export type DiscoveredLocalModel = {
  id: string;
  name?: string;
};

export type DiscoverLocalModelsResult =
  | { ok: true; models: DiscoveredLocalModel[] }
  | { ok: false; error: string };

export type TestLocalConnectionResult =
  | { ok: true; modelCount: number }
  | { ok: false; error: string };

export type HarnessMenuAction =
  | { type: "open-settings"; section?: SettingsMenuSection }
  | { type: "open-folder" }
  | { type: "new-conversation" }
  | { type: "toggle-sidebar" }
  | { type: "toggle-swarm" }
  | { type: "set-theme"; theme: AppTheme };

export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; progress: number }
  | { status: "downloaded"; version: string }
  | { status: "not-available" }
  | { status: "error"; message: string };

export interface NewModelsNoticePayload {
  version: string;
  models: HarnessModelInfo[];
}

export type ProviderAuthSource = "stored" | "environment";

export type CloudProviderInfo = {
  id: string;
  displayName: string;
  envVars: readonly string[];
  configured: boolean;
  maskedHint?: string;
  source?: ProviderAuthSource;
  envVar?: string;
};

export interface HarnessSettings {
  useGlobalPiConfig: boolean;
  piAgentDir: string;
  theme: AppTheme;
  openrouter: OpenRouterAuthStatus;
  openrouterManagement: OpenRouterManagementStatus;
  exa: ExaStatus;
  openrouterAccountCredits?: OpenRouterAccountCreditsResult;
  tokenUsage: TokenUsageTotals;
  /** Curated cloud providers with configured credentials. */
  configuredProviders: string[];
  swarmDefaultModel: string;
  /** Up to 5 provider/model refs shown in the chat model selector; empty uses defaults. */
  chatVisibleModels: string[];
  /** provider/model ref used to generate thread titles. */
  titleGenerationModel: string;
  /** True when a cloud or local model provider is configured. */
  canSendMessages: boolean;
}

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
  filters?: {
    commentAuthor?: "anyone" | "non_bot";
    prAuthor?: "anyone";
  };
};

export type WorkflowScheduleTrigger = {
  id: string;
  kind: "schedule";
  preset?: WorkflowSchedulePreset;
  cronExpression: string;
  timezone: string;
  label?: string;
};

export type WorkflowTrigger = WorkflowGitPrTrigger | WorkflowScheduleTrigger;

export const DEFAULT_WORKFLOW_TIMEZONE =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

export type WorkflowTools = {
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
};

export type WorkflowTemplateId = "pr_review" | "comment_fixer" | "dependency_cve_scan";

export type WorkflowRecord = {
  id: string;
  connectionId: string;
  name: string;
  enabled: boolean;
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
  id: WorkflowTemplateId;
  name: string;
  description: string;
  model: string;
  instructions: string;
  triggers: WorkflowTrigger[];
  tools: WorkflowTools;
};

export type WorkflowRunSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerLabel: string;
  event: string;
  prNumber: number;
  status: string;
  errorMessage: string | null;
  iteration: number;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
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

export type WorkflowConversationPayload = {
  conversationId: string;
  projectCwd: string;
  title: string;
  messages: unknown[];
  source: "github-workflow";
  streaming: boolean;
};

export interface HarnessAPI {
  platform: NodeJS.Platform;
  nativeVibrancyEnabled: boolean;
  pickDirectory: () => Promise<{ canceled: true } | { canceled: false; cwd: string }>;
  getLastCwd: () => Promise<string | null>;
  listProjects: () => Promise<ProjectSummary[]>;
  removeProject: (options: { cwd: string }) => Promise<{ ok: boolean }>;
  listConversations: (options: { cwd: string }) => Promise<ConversationSummary[]>;
  searchFiles: (options: { query: string }) => Promise<{ files: ProjectFile[] }>;
  getSlashCommands: (options: {
    sessionKey: string;
  }) => Promise<{ items: import("../shared/thread-tools").SlashMenuItem[] }>;
  getStaticSlashCommands: () => Promise<{
    items: import("../shared/thread-tools").SlashMenuItem[];
  }>;
  start: (options: {
    cwd: string;
    sessionFile?: string;
    conversationId: string;
  }) => Promise<{
    ok: boolean;
    cwd: string;
    sessionKey: string;
    messages: unknown[] | null;
  }>;
  setActiveSession: (options: { sessionKey: string }) => Promise<{ ok: boolean }>;
  newSession: (options: { sessionKey: string }) => Promise<HarnessResponse>;
  getMessages: (options: { sessionKey: string }) => Promise<unknown[] | null>;
  stop: () => Promise<{ ok: boolean }>;
  prompt: (options: {
    sessionKey: string;
    message: string;
    images?: HarnessImageContent[];
    streamingBehavior?: "steer" | "followUp";
    tools?: import("../shared/thread-tools").ToolInvocation[];
  }) => Promise<HarnessResponse>;
  abort: (options: { sessionKey: string }) => Promise<HarnessResponse>;
  respondExtensionUi: (options: ExtensionUiResponseOptions) => Promise<{ ok: boolean }>;
  getState: (options: { sessionKey: string }) => Promise<HarnessState | null>;
  getSessionStats: (options: { sessionKey: string }) => Promise<SessionStats | null>;
  getAvailableModels: (options: { sessionKey?: string | null }) => Promise<HarnessModelInfo[]>;
  getCloudProviders: () => Promise<CloudProviderInfo[]>;
  setProviderApiKey: (options: {
    provider: string;
    apiKey: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  clearProviderApiKey: (options: {
    provider: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  setModel: (options: {
    sessionKey: string;
    provider: string;
    modelId: string;
  }) => Promise<HarnessResponse>;
  setThinkingLevel: (options: {
    sessionKey: string;
    level: ThinkingLevel;
  }) => Promise<HarnessResponse>;
  setSwarmMode: (options: {
    sessionKey: string;
    enabled: boolean;
  }) => Promise<HarnessResponse>;
  getStatus: () => Promise<HarnessStatus>;
  getSettings: () => Promise<HarnessSettings>;
  refreshCredits: () => Promise<OpenRouterAccountCreditsResult>;
  setSettings: (options: {
    useGlobalPiConfig?: boolean;
    theme?: AppTheme;
    openrouterApiKey?: string;
    clearOpenRouterApiKey?: boolean;
    openrouterManagementKey?: string;
    clearOpenRouterManagementKey?: boolean;
    exaApiKey?: string;
    clearExaApiKey?: boolean;
    swarmDefaultModel?: string;
    chatVisibleModels?: string[];
    titleGenerationModel?: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  listProjectsFromGlobalPi: () => Promise<ProjectSummary[]>;
  listConversationsFromGlobalPi: (options: {
    cwd: string;
  }) => Promise<ConversationSummary[]>;
  generateTitle: (options: {
    message: string;
  }) => Promise<{ title: string | null }>;
  getGitLineStats: (options: {
    cwd: string;
    filePaths?: string[];
  }) => Promise<GitLineStatsAggregate | null>;
  getGithubStatus: () => Promise<GithubStatus>;
  getGithubInstallUrl: () => Promise<{ url: string }>;
  openGithubInstall: () => Promise<{ ok: boolean }>;
  getSessionDiagnostics: () => Promise<SessionDiagnostics>;
  getGitRemoteInfo: (options: { cwd: string }) => Promise<GitRemoteInfo>;
  getGithubConnection: (options: {
    projectPath: string;
  }) => Promise<GithubProjectConnection>;
  connectGithubRepo: (options: {
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl?: string | null;
  }) => Promise<GithubConnectResult>;
  disconnectGithubRepo: (options: { projectPath: string }) => Promise<{ ok: boolean }>;
  listGithubRepos: (options?: {
    q?: string;
    page?: number;
  }) => Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }>;
  listRepoBranches: (options: {
    owner: string;
    repo: string;
  }) => Promise<{ defaultBranch: string; branches: string[] }>;
  listWorkflows: () => Promise<WorkflowsListResponse>;
  getWorkflow: (options: { workflowId: string }) => Promise<{ workflow: WorkflowRecord }>;
  createWorkflow: (options: {
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl?: string | null;
    name?: string;
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch: string;
    triggers?: WorkflowTrigger[];
    tools?: WorkflowTools;
  }) => Promise<{ ok: boolean; warning?: string | null; workflow: WorkflowRecord }>;
  updateWorkflow: (options: {
    workflowId: string;
    projectPath?: string;
    owner?: string;
    repo?: string;
    remoteUrl?: string | null;
    name?: string;
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch?: string;
    triggers?: WorkflowTrigger[];
    tools?: WorkflowTools;
  }) => Promise<{ ok: boolean; workflow: WorkflowRecord }>;
  deleteWorkflow: (options: { workflowId: string }) => Promise<{ ok: boolean }>;
  triggerWorkflowRun: (options: {
    workflowId: string;
  }) => Promise<{ ok: boolean; runId: string }>;
  listWorkflowRuns: (options?: {
    workflowId?: string;
    limit?: number;
    cursor?: string;
  }) => Promise<{ runs: WorkflowRunSummary[]; nextCursor: string | null }>;
  getWorkflowRunStats: (options?: {
    workflowId?: string;
  }) => Promise<{ stats: WorkflowRunStats }>;
  /** @deprecated Use listWorkflows */
  getWorkflowSettings: () => Promise<WorkflowsListResponse>;
  onWorkflowConversation: (
    callback: (payload: WorkflowConversationPayload) => void,
  ) => () => void;
  syncWorkflowConversations: () => Promise<{ ok: boolean }>;
  onEvent: (callback: (envelope: HarnessEventEnvelope) => void) => () => void;
  getAppVersion: () => Promise<string>;
  requestElectronAuth: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
  onNewModelsAvailable: (callback: (payload: NewModelsNoticePayload) => void) => () => void;
  dismissNewModelsNotice: (options: { version: string }) => Promise<void>;
  onMenuAction: (callback: (action: HarnessMenuAction) => void) => () => void;
  getLocalProviders: () => Promise<LocalProvidersState>;
  setLocalProviders: (options: {
    providers: LocalProviderConfig[];
  }) => Promise<{ ok: boolean }>;
  discoverLocalModels: (options: { baseUrl: string; apiKey?: string }) => Promise<DiscoverLocalModelsResult>;
  testLocalConnection: (options: { baseUrl: string; apiKey?: string }) => Promise<TestLocalConnectionResult>;
}
