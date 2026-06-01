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
  }) => Promise<{ ok: boolean; cwd: string; messages: unknown[] | null }>;
  newSession: () => Promise<HarnessResponse>;
  getMessages: () => Promise<unknown[] | null>;
  stop: () => Promise<{ ok: boolean }>;
  prompt: (options: {
    message: string;
    streamingBehavior?: "steer" | "followUp";
  }) => Promise<HarnessResponse>;
  abort: () => Promise<HarnessResponse>;
  getState: () => Promise<HarnessState | null>;
  getSessionStats: () => Promise<SessionStats | null>;
  getStatus: () => Promise<HarnessStatus>;
  onEvent: (callback: (event: unknown) => void) => () => void;
}
