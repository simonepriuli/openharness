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
  getState: (options: { sessionKey: string }) => Promise<HarnessState | null>;
  getSessionStats: (options: { sessionKey: string }) => Promise<SessionStats | null>;
  getStatus: () => Promise<HarnessStatus>;
  onEvent: (callback: (envelope: HarnessEventEnvelope) => void) => () => void;
}
