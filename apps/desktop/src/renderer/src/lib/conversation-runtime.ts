import type { TimelineState } from "../events";
import { createInitialTimelineState } from "../events";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type ConversationRuntime = {
  conversationId: string;
  sessionKey: string;
  cwd: string;
  sessionFile: string | null;
  title: string;
  timeline: TimelineState;
  isStreaming: boolean;
  status: ConnectionStatus;
  error: string | null;
};

export function createConversationRuntime(input: {
  conversationId: string;
  sessionKey: string;
  cwd: string;
  sessionFile?: string | null;
  title?: string;
  timeline?: TimelineState;
  isStreaming?: boolean;
  status?: ConnectionStatus;
  error?: string | null;
}): ConversationRuntime {
  return {
    conversationId: input.conversationId,
    sessionKey: input.sessionKey,
    cwd: input.cwd,
    sessionFile: input.sessionFile ?? null,
    title: input.title ?? "New conversation",
    timeline: input.timeline ?? createInitialTimelineState(),
    isStreaming: input.isStreaming ?? false,
    status: input.status ?? "connecting",
    error: input.error ?? null,
  };
}

export function collectStreamingConversationIds(
  runtimes: Map<string, ConversationRuntime>,
): Set<string> {
  const ids = new Set<string>();
  for (const runtime of runtimes.values()) {
    if (runtime.isStreaming) {
      ids.add(runtime.conversationId);
    }
  }
  return ids;
}

export function findConversationIdBySessionKey(
  runtimes: Map<string, ConversationRuntime>,
  sessionKey: string,
): string | undefined {
  for (const [id, runtime] of runtimes) {
    if (runtime.sessionKey === sessionKey) return id;
  }

  const fileMarker = "::file::";
  const fileIndex = sessionKey.indexOf(fileMarker);
  if (fileIndex === -1) return undefined;

  const cwd = sessionKey.slice(0, fileIndex);
  const sessionFile = sessionKey.slice(fileIndex + fileMarker.length);
  for (const [id, runtime] of runtimes) {
    if (runtime.cwd !== cwd) continue;
    runtime.sessionKey = sessionKey;
    runtime.sessionFile = sessionFile;
    return id;
  }

  return undefined;
}
