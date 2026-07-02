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
  /** Per-day total tokens keyed by local YYYY-MM-DD. */
  daily: Record<string, number>;
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
  planMode?: boolean;
  planConversationId?: string;
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
  absolutePath?: string;
  rootLabel?: string;
}

export type AttachedRoot = {
  id: string;
  absolutePath: string;
  kind: "file" | "folder";
  label: string;
};

export type ProjectGitStatus = "added" | "deleted" | "ignored" | "modified" | "renamed" | "untracked";

export interface ProjectGitStatusEntry {
  path: string;
  status: ProjectGitStatus;
}

export type ProjectUnstagedChangeStatus = "modified" | "deleted" | "added" | "untracked";

export interface ProjectUnstagedChangeEntry {
  path: string;
  status: ProjectUnstagedChangeStatus;
}

export interface ProjectUnstagedChanges {
  files: ProjectUnstagedChangeEntry[];
  patch: string;
}

export type ReadProjectFileError = "not_found" | "too_large" | "binary" | "outside_project" | "directory";

export type ReadProjectFileResult =
  | { ok: true; relativePath: string; contents: string }
  | { ok: false; relativePath: string; error: ReadProjectFileError };

export type WriteProjectFileError = "not_found" | "too_large" | "outside_project" | "directory";

export type WriteProjectFileResult =
  | { ok: true; relativePath: string; mtimeMs: number }
  | { ok: false; relativePath: string; error: WriteProjectFileError };

export interface ProjectFileChangePayload {
  cwd: string;
  relativePath: string;
}

export type ReadWorkbookFileError =
  | "not_found"
  | "outside_project"
  | "too_large"
  | "not_xlsx"
  | "not_office_file"
  | "directory";

export type ReadOfficeFileError = ReadWorkbookFileError;

export type ReadWorkbookFileResult =
  | { ok: true; relativePath: string; mtimeMs: number; base64: string }
  | { ok: false; relativePath: string; error: ReadWorkbookFileError };

export type ReadOfficeFileResult =
  | { ok: true; relativePath: string; mtimeMs: number; base64: string; kind: "docx" | "xlsx" }
  | { ok: false; relativePath: string; error: ReadOfficeFileError };

export interface WorkbookChangePayload {
  cwd: string;
  relativePath: string;
}

export type OfficeChangePayload = WorkbookChangePayload;

export type OpenWorkbookWithTarget =
  | "default"
  | "microsoft-excel"
  | "numbers"
  | "libreoffice-calc";

export type OpenOfficeWithTarget =
  | OpenWorkbookWithTarget
  | "microsoft-word"
  | "pages"
  | "libreoffice-writer";

export interface WorkbookOpenWithOption {
  id: OpenWorkbookWithTarget;
  label: string;
  iconDataUrl?: string;
}

export interface OfficeOpenWithOption {
  id: OpenOfficeWithTarget;
  label: string;
  iconDataUrl?: string;
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
  source?: "stored" | "organization";
}

export type ExaAuthSource = "stored" | "environment" | "organization";

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
  provider: "github" | "azure_devops" | null;
  owner: string | null;
  repo: string | null;
  namespace: string | null;
};

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
  error?: string;
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

export type AppWorkMode = "coding" | "everyday";

export type SettingsMenuSection =
  | "general"
  | "chat"
  | "oauth-providers"
  | "local-providers"
  | "swarm";

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

export type ProviderAuthSource = "stored" | "environment" | "organization";

export type CloudProviderInfo = {
  id: string;
  displayName: string;
  envVars: readonly string[];
  configured: boolean;
  maskedHint?: string;
  source?: ProviderAuthSource;
  envVar?: string;
};

export type OAuthProviderInfo = {
  id: string;
  displayName: string;
  configured: boolean;
  accountHint?: string;
};

export type OAuthDeviceCodePayload = {
  providerId: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds?: number;
};

export type OAuthLoginProgressPayload = {
  message: string;
};

export type OAuthLoginCompletePayload = {
  providerId: string;
};

export type OAuthLoginFailedPayload = {
  providerId: string;
  message: string;
};

export interface HarnessSettings {
  theme: AppTheme;
  workMode: AppWorkMode;
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
  /** provider/model ref used to summarize completed workflow runs. */
  workflowSummarizationModel: string;
  /** True when a cloud, OAuth, or local model provider is configured. */
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

export type WorkflowTeamsMentionTrigger = {
  id: string;
  kind: "teams_mention";
};

export type WorkflowDiscordMentionTrigger = {
  id: string;
  kind: "discord_mention";
};

export type WorkflowTrigger =
  | WorkflowGitPrTrigger
  | WorkflowScheduleTrigger
  | WorkflowTeamsMentionTrigger
  | WorkflowDiscordMentionTrigger;

export const DEFAULT_WORKFLOW_TIMEZONE =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

export type WorkflowTools = {
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
  prCreate: boolean;
  teamsNotify: boolean;
  discordNotify?: boolean;
};

export type WorkflowTemplateId =
  | "pr_review"
  | "comment_fixer"
  | "dependency_cve_scan"
  | "teams_bug_triage"
  | "discord_bug_triage";

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
  resolvedExecutor: "cloud" | "local";
  runnerKind: "desktop" | "cloud" | null;
};

export type WorkflowRunStats = {
  successful24h: number;
  failed24h: number;
  successful7d: number;
  failed7d: number;
};

export type CveVulnerability = {
  dependency: string;
  version?: string;
  advisory?: string;
  severity?: string;
  action?: string;
};

export type WorkflowRunResultPayload =
  | {
      kind: "cve_scan";
      summary: string;
      vulnerabilities: CveVulnerability[];
    }
  | {
      kind: "bug_triage";
      summary: string;
      findings: string[];
      suggestedNextSteps: string[];
    }
  | {
      kind: "pr_review";
      action: "approve" | "comment";
      summary: string;
      inlineCommentCount: number;
    }
  | {
      kind: "generic";
      summary: string;
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
  provider: string;
  namespace: string;
  repoName: string;
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

export type WorkflowRunUpdatePayload = {
  runId: string;
  workflowId: string | null;
  title: string;
  messages: unknown[];
  streaming: boolean;
};

/** @deprecated Use WorkflowRunUpdatePayload */
export type WorkflowConversationPayload = WorkflowRunUpdatePayload;

export type OrgSecretSlotStatus = {
  slot: string;
  displayName: string;
  configured: boolean;
  maskedHint?: string;
  updatedAt?: string;
};

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

export interface HarnessAPI {
  platform: NodeJS.Platform;
  nativeVibrancyEnabled: boolean;
  pickDirectory: (
    options?: { skipOpenHarness?: boolean },
  ) => Promise<{ canceled: true } | { canceled: false; cwd: string }>;
  getWorkWorkspacePath: () => Promise<string>;
  getLastCwd: () => Promise<string | null>;
  listProjects: () => Promise<ProjectSummary[]>;
  removeProject: (options: { cwd: string }) => Promise<{ ok: boolean }>;
  listConversations: (options: { cwd: string }) => Promise<ConversationSummary[]>;
  searchFiles: (options: { query: string; sessionKey?: string }) => Promise<{ files: ProjectFile[] }>;
  listProjectFiles: (options: { cwd: string }) => Promise<{ paths: string[] }>;
  getProjectGitStatus: (options: { cwd: string }) => Promise<{ entries: ProjectGitStatusEntry[] }>;
  getProjectUnstagedChanges: (options: { cwd: string }) => Promise<ProjectUnstagedChanges>;
  readProjectFile: (options: {
    cwd: string;
    relativePath: string;
    sessionKey?: string;
  }) => Promise<ReadProjectFileResult>;
  writeProjectFile: (options: {
    cwd: string;
    relativePath: string;
    contents: string;
    sessionKey?: string;
  }) => Promise<WriteProjectFileResult>;
  setMarkdownEditLock: (options: {
    sessionKey: string;
    relativePath: string;
    locked: boolean;
  }) => Promise<{ ok: true }>;
  getMarkdownEditLocks: (options: {
    sessionKey: string;
  }) => Promise<{ lockedPaths: string[] }>;
  clearMarkdownEditLocks: (options: { sessionKey: string }) => Promise<{ ok: true }>;
  watchProjectFile: (options: {
    cwd: string;
    relativePath: string;
  }) => Promise<{ ok: boolean }>;
  unwatchProjectFile: () => Promise<{ ok: boolean }>;
  onProjectFileChanged: (
    callback: (payload: ProjectFileChangePayload) => void,
  ) => () => void;
  readWorkbookFile: (options: {
    cwd: string;
    relativePath: string;
    sessionKey?: string;
  }) => Promise<ReadWorkbookFileResult>;
  listWorkbookFiles: (options: { cwd: string }) => Promise<{ paths: string[] }>;
  watchWorkbookFile: (options: {
    cwd: string;
    relativePath: string;
    sessionKey?: string;
  }) => Promise<{ ok: boolean }>;
  unwatchWorkbookFile: () => Promise<{ ok: boolean }>;
  onWorkbookChanged: (callback: (payload: WorkbookChangePayload) => void) => () => void;
  listWorkbookOpenWithApps: () => Promise<WorkbookOpenWithOption[]>;
  openWorkbookWith: (options: {
    cwd: string;
    relativePath: string;
    target: OpenWorkbookWithTarget;
    sessionKey?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  readOfficeFile: (options: {
    cwd: string;
    relativePath: string;
    sessionKey?: string;
  }) => Promise<ReadOfficeFileResult>;
  watchOfficeFile: (options: {
    cwd: string;
    relativePath: string;
    sessionKey?: string;
  }) => Promise<{ ok: boolean }>;
  unwatchOfficeFile: () => Promise<{ ok: boolean }>;
  onOfficeFileChanged: (callback: (payload: OfficeChangePayload) => void) => () => void;
  listOfficeOpenWithApps: (options?: {
    kind?: "docx" | "xlsx";
  }) => Promise<OfficeOpenWithOption[]>;
  openOfficeWith: (options: {
    cwd: string;
    relativePath: string;
    target: OpenOfficeWithTarget;
    sessionKey?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  pickExternalPaths: (options?: {
    multi?: boolean;
  }) => Promise<{ canceled: true } | { canceled: false; paths: AttachedRoot[] }>;
  getPathForFile: (file: File) => string;
  attachedRootsFromPaths: (paths: string[]) => Promise<AttachedRoot[]>;
  setAttachedRoots: (options: {
    sessionKey: string;
    roots: AttachedRoot[];
  }) => Promise<{ ok: true; roots: AttachedRoot[] }>;
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
    conversationContext?: "coding" | "work" | "work-project";
    attachedRoots?: AttachedRoot[];
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
  getOAuthProviders: () => Promise<OAuthProviderInfo[]>;
  startOAuthLogin: (options: { providerId: string }) => Promise<{ started: boolean }>;
  cancelOAuthLogin: () => Promise<{ ok: boolean }>;
  logoutOAuthProvider: (options: {
    providerId: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  openExternal: (options: { url: string }) => Promise<{ ok: boolean }>;
  onOAuthDeviceCode: (callback: (payload: OAuthDeviceCodePayload) => void) => () => void;
  onOAuthLoginProgress: (callback: (payload: OAuthLoginProgressPayload) => void) => () => void;
  onOAuthLoginComplete: (callback: (payload: OAuthLoginCompletePayload) => void) => () => void;
  onOAuthLoginFailed: (callback: (payload: OAuthLoginFailedPayload) => void) => () => void;
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
  setPlanMode: (options: {
    sessionKey: string;
    enabled: boolean;
    conversationId?: string;
  }) => Promise<HarnessResponse>;
  getPlanFile: (options: {
    cwd: string;
    conversationId: string;
  }) => Promise<
    | { ok: true; relativePath: string; contents: string }
    | { ok: false; relativePath: string; missing?: boolean; error?: string }
  >;
  deletePlanFile: (options: {
    cwd: string;
    conversationId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  getStatus: () => Promise<HarnessStatus>;
  getSettings: () => Promise<HarnessSettings>;
  refreshCredits: () => Promise<OpenRouterAccountCreditsResult>;
  setSettings: (options: {
    theme?: AppTheme;
    workMode?: AppWorkMode;
    openrouterApiKey?: string;
    clearOpenRouterApiKey?: boolean;
    openrouterManagementKey?: string;
    clearOpenRouterManagementKey?: boolean;
    exaApiKey?: string;
    clearExaApiKey?: boolean;
    swarmDefaultModel?: string;
    chatVisibleModels?: string[];
    titleGenerationModel?: string;
    workflowSummarizationModel?: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  generateTitle: (options: {
    message: string;
  }) => Promise<{ title: string | null }>;
  getGitLineStats: (options: {
    cwd: string;
    filePaths?: string[];
  }) => Promise<GitLineStatsAggregate | null>;
  getGithubStatus: () => Promise<GithubStatus>;
  getAzureDevOpsStatus: () => Promise<AzureDevOpsStatus>;
  connectAzureDevOps: (options: { orgName: string; pat: string }) => Promise<{
    ok: boolean;
    connectionId: string;
    displayName: string;
    repoCount: number;
  }>;
  disconnectAzureDevOps: () => Promise<{ ok: boolean }>;
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
  connectSourceControlRepo: (options: {
    provider: "github" | "azure_devops";
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl?: string | null;
  }) => Promise<GithubConnectResult>;
  disconnectGithubRepo: (options: { projectPath: string }) => Promise<{ ok: boolean }>;
  listOrgGithubConnections: () => Promise<{
    connections: Array<{
      id: string;
      provider?: "github" | "azure_devops";
      githubOwner: string;
      githubRepo: string;
      fullName: string;
      installationId: string;
    }>;
  }>;
  listRunnerBindings: (options?: { runnerInstanceId?: string }) => Promise<{
    bindings: Array<{
      id: string;
      connectionId: string;
      projectPath: string;
      label: string | null;
      owner: string;
      repo: string;
      fullName: string;
      runnerInstanceId: string;
      lastSeenAt: string | null;
    }>;
  }>;
  upsertRunnerBinding: (options: {
    connectionId: string;
    projectPath: string;
    label?: string | null;
  }) => Promise<{ ok: boolean }>;
  getWorkflowRunnerInstanceId: () => Promise<{ runnerInstanceId: string }>;
  listGithubRepos: (options?: {
    q?: string;
    page?: number;
  }) => Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }>;
  listAzureDevOpsRepos: (options?: {
    q?: string;
    page?: number;
  }) => Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }>;
  listSourceControlRepos: (
    provider: "github" | "azure_devops",
    options?: { q?: string; page?: number },
  ) => Promise<{ repos: GithubRepoSummary[]; total: number; page: number; perPage: number }>;
  listRepoBranches: (options: {
    owner: string;
    repo: string;
    provider?: "github" | "azure_devops";
  }) => Promise<{ defaultBranch: string; branches: string[] }>;
  getTeamsStatus: () => Promise<TeamsStatus>;
  openTeamsConnect: () => Promise<{ ok: boolean }>;
  listTeamsMappings: () => Promise<{ mappings: TeamsChannelRepoMapping[] }>;
  listTeamsForUser: () => Promise<{ teams: TeamsTeamSummary[] }>;
  listTeamsChannels: (options: {
    teamId: string;
  }) => Promise<{ channels: TeamsChannelSummary[] }>;
  upsertTeamsMapping: (options: {
    installationId: string;
    teamId: string;
    channelId: string;
    channelName: string;
    provider?: string;
    namespace?: string;
    repoName?: string;
    githubOwner: string;
    githubRepo: string;
  }) => Promise<{ ok: boolean; mapping: TeamsChannelRepoMapping }>;
  deleteTeamsMapping: (options: { mappingId: string }) => Promise<{ ok: boolean }>;
  getDiscordStatus: () => Promise<DiscordStatus>;
  openDiscordConnect: () => Promise<{ ok: boolean }>;
  listDiscordMappings: () => Promise<{ mappings: DiscordChannelRepoMapping[] }>;
  listDiscordGuilds: () => Promise<{ guilds: DiscordGuildSummary[] }>;
  listDiscordChannels: (options: {
    guildId: string;
  }) => Promise<{ channels: DiscordChannelSummary[] }>;
  upsertDiscordMapping: (options: {
    installationId: string;
    guildId: string;
    channelId: string;
    channelName: string;
    provider?: string;
    namespace?: string;
    repoName?: string;
    githubOwner: string;
    githubRepo: string;
  }) => Promise<{ ok: boolean; mapping: DiscordChannelRepoMapping }>;
  deleteDiscordMapping: (options: { mappingId: string }) => Promise<{ ok: boolean }>;
  getOrganization: () => Promise<{
    organization: { id: string; name: string; slug: string; cloudWorkersEnabled: boolean };
    membership: { id: string; role: string };
  }>;
  listOrgMembers: () => Promise<{
    members: Array<{
      id: string;
      role: string;
      createdAt: string;
      user: { id: string; name: string; email: string; image: string | null };
    }>;
  }>;
  getOrgCanManage: () => Promise<{ canManage: boolean }>;
  getOrgOnboardingStatus: () => Promise<{ hasOrganization: boolean }>;
  createOrganization: (options: { name: string }) => Promise<{
    organization: { id: string; name: string; slug: string };
    membership: { id: string; role: string };
  }>;
  joinOrganizationWithCode: (options: { code: string }) => Promise<{
    organization: { id: string; name: string; slug: string };
    membership: { id: string; role: string };
  }>;
  getOrgInviteCode: () => Promise<{ code: string; formatted: string }>;
  regenerateOrgInviteCode: () => Promise<{ code: string; formatted: string }>;
  updateOrgMemberRole: (options: {
    memberId: string;
    role: "member" | "admin" | "owner";
  }) => Promise<void>;
  removeOrgMember: (options: { memberId: string }) => Promise<void>;
  updateOrganization: (options: {
    name?: string;
    cloudWorkersEnabled?: boolean;
  }) => Promise<void>;
  getOrgSecrets: () => Promise<{ slots: OrgSecretSlotStatus[] }>;
  upsertOrgSecret: (options: { slot: string; value: string }) => Promise<{ slot: OrgSecretSlotStatus }>;
  deleteOrgSecret: (options: { slot: string }) => Promise<{ ok: boolean }>;
  syncOrgSecrets: () => Promise<{ configuredCount: number }>;
  getOrgManagedSecretSlots: () => Promise<string[]>;
  listRepoEnvironments: () => Promise<{ repos: RepoEnvironmentSummary[] }>;
  listRepoEnvironmentVariables: (options: {
    connectionId: string;
  }) => Promise<{ variables: RepoEnvironmentVariable[] }>;
  upsertRepoEnvironmentVariable: (options: {
    connectionId: string;
    key: string;
    value: string;
    isSecret: boolean;
    description?: string | null;
  }) => Promise<{ variable: RepoEnvironmentVariable }>;
  deleteRepoEnvironmentVariable: (options: {
    connectionId: string;
    key: string;
  }) => Promise<{ ok: boolean }>;
  listWorkflows: () => Promise<WorkflowsListResponse>;
  getWorkflow: (options: { workflowId: string }) => Promise<{ workflow: WorkflowRecord }>;
  createWorkflow: (options: {
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
    triggers?: WorkflowTrigger[];
    tools?: WorkflowTools;
  }) => Promise<{ ok: boolean; warning?: string | null; workflow: WorkflowRecord }>;
  updateWorkflow: (options: {
    workflowId: string;
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
  getWorkflowRun: (runId: string) => Promise<{ run: WorkflowRunDetail }>;
  listWorkflowRunEvents: (options: {
    runId: string;
    afterSeq?: number;
    limit?: number;
  }) => Promise<{
    events: Array<{ seq: number; event: unknown; createdAt: string }>;
    hasMore: boolean;
  }>;
  dismissWorkflowRun: (options: {
    runId: string;
    reason?: string;
  }) => Promise<{ run: WorkflowRunDetail }>;
  getWorkflowRunStats: (options?: {
    workflowId?: string;
  }) => Promise<{ stats: WorkflowRunStats }>;
  /** @deprecated Use listWorkflows */
  getWorkflowSettings: () => Promise<WorkflowsListResponse>;
  onWorkflowRunUpdate: (callback: (payload: WorkflowRunUpdatePayload) => void) => () => void;
  /** @deprecated Use onWorkflowRunUpdate */
  onWorkflowConversation: (
    callback: (payload: WorkflowRunUpdatePayload) => void,
  ) => () => void;
  syncWorkflowRuns: () => Promise<{ ok: boolean; reconciled: number }>;
  /** @deprecated Use syncWorkflowRuns */
  syncWorkflowConversations: () => Promise<{ ok: boolean }>;
  onEvent: (callback: (envelope: HarnessEventEnvelope) => void) => () => void;
  getAppVersion: () => Promise<string>;
  requestElectronAuth: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  isUpdaterEnabled: () => Promise<boolean>;
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
