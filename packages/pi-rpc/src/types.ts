/**
 * RPC types used by OpenHarness. Keep in sync with Pi upstream:
 * vendor/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts
 */

export type StreamingBehavior = "steer" | "followUp";

export interface TokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
  tokenStats?: TokenStats;
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

/** Commands OpenHarness sends today; see upstream `RpcCommand` for the full set. */
export type PiCommand =
  | {
      id?: string;
      type: "prompt";
      message: string;
      streamingBehavior?: StreamingBehavior;
    }
  | { id?: string; type: "abort" }
  | { id?: string; type: "get_state" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "steer"; message: string }
  | { id?: string; type: "follow_up"; message: string }
  | { id?: string; type: "new_session"; parentSession?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "set_thinking_level"; level: string }
  | { id?: string; type: "set_swarm_mode"; enabled: boolean }
  | { id?: string; type: "set_swarn_mode"; enabled: boolean } // backwards compatibility
  | { id?: string; type: "cycle_thinking_level" }
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_session_name"; name: string };

export interface PiResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface PiState {
  model: unknown | null;
  thinkingLevel?: string;
  swarmMode?: boolean;
  isStreaming: boolean;
  isCompacting?: boolean;
  steeringMode?: "all" | "one-at-a-time";
  followUpMode?: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  autoCompactionEnabled?: boolean;
  messageCount?: number;
  pendingMessageCount?: number;
}

export type PiEvent = Record<string, unknown> & { type: string };

export interface PiRpcStartOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  noSession?: boolean;
}
