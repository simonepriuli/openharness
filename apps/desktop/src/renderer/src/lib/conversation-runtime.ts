import type { ComposerSegment } from "./composer-draft";
import { createInitialTimelineState, timelineIndicatesStreaming, type TimelineState } from "../events";

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
  /** Unsent composer text for this conversation (not shared across chats). */
  composerDraft?: ComposerSegment[];
  /** Per-thread mode toggle for delegated sub-agent orchestration. */
  swarmMode?: boolean;
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
  swarmMode?: boolean;
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
    swarmMode: input.swarmMode ?? false,
  };
}

export function runtimeIsStreaming(runtime: ConversationRuntime): boolean {
  return runtime.isStreaming || timelineIndicatesStreaming(runtime.timeline);
}

export function collectStreamingConversationIds(
  runtimes: Map<string, ConversationRuntime>,
): Set<string> {
  const ids = new Set<string>();
  for (const runtime of runtimes.values()) {
    if (runtimeIsStreaming(runtime)) {
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
