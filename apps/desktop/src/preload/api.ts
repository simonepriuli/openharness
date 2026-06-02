export interface HarnessStatus {
  running: boolean;
  cwd: string | null;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
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

export interface ExtensionUiResponseOptions {
  sessionKey: string;
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: true;
}

export interface HarnessModelInfo {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface OpenRouterAuthStatus {
  configured: boolean;
  maskedHint?: string;
}

export type AppTheme = "system" | "light" | "dark";

export interface HarnessSettings {
  useGlobalPiConfig: boolean;
  piAgentDir: string;
  theme: AppTheme;
  openrouter: OpenRouterAuthStatus;
  swarmDefaultModel: string;
}

export interface HarnessAPI {
  platform: NodeJS.Platform;
  nativeVibrancyEnabled: boolean;
  pickDirectory: () => Promise<{ canceled: true } | { canceled: false; cwd: string }>;
  getLastCwd: () => Promise<string | null>;
  listProjects: () => Promise<ProjectSummary[]>;
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
    streamingBehavior?: "steer" | "followUp";
  }) => Promise<HarnessResponse>;
  abort: (options: { sessionKey: string }) => Promise<HarnessResponse>;
  respondExtensionUi: (options: ExtensionUiResponseOptions) => Promise<{ ok: boolean }>;
  getState: (options: { sessionKey: string }) => Promise<HarnessState | null>;
  getSessionStats: (options: { sessionKey: string }) => Promise<SessionStats | null>;
  getAvailableModels: (options: { sessionKey: string }) => Promise<HarnessModelInfo[]>;
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
  setSettings: (options: {
    useGlobalPiConfig?: boolean;
    theme?: AppTheme;
    openrouterApiKey?: string;
    clearOpenRouterApiKey?: boolean;
    swarmDefaultModel?: string;
  }) => Promise<HarnessSettings & { ok: boolean }>;
  listProjectsFromGlobalPi: () => Promise<ProjectSummary[]>;
  listConversationsFromGlobalPi: (options: {
    cwd: string;
  }) => Promise<ConversationSummary[]>;
  onEvent: (callback: (envelope: HarnessEventEnvelope) => void) => () => void;
}
