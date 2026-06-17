import type { ComposerSegment } from "./composer-draft";
import type { PendingQuestionState } from "./pending-question";
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
  /** Transient structured question UI state (not persisted in history). */
  pendingQuestion?: PendingQuestionState | null;
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
    pendingQuestion: null,
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

const DRAFT_MARKER = "::draft::";
const FILE_MARKER = "::file::";

/** Pure lookup — mirrors main-process session identity resolution. */
export function findConversationIdBySessionKey(
  runtimes: Map<string, ConversationRuntime>,
  sessionKey: string,
): string | undefined {
  for (const [id, runtime] of runtimes) {
    if (runtime.sessionKey === sessionKey) return id;
  }

  const draftIndex = sessionKey.indexOf(DRAFT_MARKER);
  if (draftIndex !== -1) {
    const cwd = sessionKey.slice(0, draftIndex);
    const conversationId = sessionKey.slice(draftIndex + DRAFT_MARKER.length);
    const runtime = runtimes.get(conversationId);
    if (runtime?.cwd === cwd) return conversationId;
    return undefined;
  }

  const fileIndex = sessionKey.indexOf(FILE_MARKER);
  if (fileIndex !== -1) {
    const cwd = sessionKey.slice(0, fileIndex);
    const sessionFile = sessionKey.slice(fileIndex + FILE_MARKER.length);
    for (const [id, runtime] of runtimes) {
      if (runtime.cwd === cwd && runtime.sessionFile === sessionFile) return id;
    }

    // Draft → file rekey: events may arrive with a file key before the renderer has sessionFile.
    const draftCandidates: string[] = [];
    for (const [id, runtime] of runtimes) {
      if (runtime.cwd !== cwd || runtime.sessionFile) continue;
      if (runtime.sessionKey.includes(DRAFT_MARKER)) draftCandidates.push(id);
    }
    if (draftCandidates.length === 1) return draftCandidates[0];
    const streamingDrafts = draftCandidates.filter((id) => {
      const runtime = runtimes.get(id);
      return runtime !== undefined && runtimeIsStreaming(runtime);
    });
    if (streamingDrafts.length === 1) return streamingDrafts[0];
  }

  return undefined;
}

/** Apply draft→file session key updates after routing an event (explicit, not during lookup). */
export function reconcileRuntimeSessionKey(
  runtime: ConversationRuntime,
  sessionKey: string,
): boolean {
  if (runtime.sessionKey === sessionKey) return false;

  const fileIndex = sessionKey.indexOf(FILE_MARKER);
  if (fileIndex === -1) return false;

  const cwd = sessionKey.slice(0, fileIndex);
  const sessionFile = sessionKey.slice(fileIndex + FILE_MARKER.length);
  if (runtime.cwd !== cwd) return false;
  if (runtime.sessionFile && runtime.sessionFile !== sessionFile) return false;

  runtime.sessionFile = sessionFile;
  runtime.sessionKey = sessionKey;
  return true;
}
