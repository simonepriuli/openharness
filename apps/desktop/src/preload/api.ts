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

export type AppTheme = "system" | "light" | "dark";

export type SettingsMenuSection =
  | "general"
  | "chat"
  | "cloud-providers"
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

export interface HarnessAPI {
  platform: NodeJS.Platform;
  nativeVibrancyEnabled: boolean;
  pickDirectory: () => Promise<{ canceled: true } | { canceled: false; cwd: string }>;
  getLastCwd: () => Promise<string | null>;
  listProjects: () => Promise<ProjectSummary[]>;
  removeProject: (options: { cwd: string }) => Promise<{ ok: boolean }>;
  listConversations: (options: { cwd: string }) => Promise<ConversationSummary[]>;
  searchFiles: (options: { query: string }) => Promise<{ files: ProjectFile[] }>;
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
  onEvent: (callback: (envelope: HarnessEventEnvelope) => void) => () => void;
  getAppVersion: () => Promise<string>;
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
