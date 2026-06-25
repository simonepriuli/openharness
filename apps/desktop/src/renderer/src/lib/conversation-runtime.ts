import type { ComposerSegment } from "./composer-draft";
import type { PendingQuestionState } from "./pending-question";
import { createInitialTimelineState, timelineIndicatesStreaming, type TimelineState } from "../events";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type WorkbookTabsState = {
  openPaths: string[];
  activePath?: string;
};

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
  /** Per-thread plan mode for interview → plan → implement workflow. */
  planMode?: boolean;
  planPhase?: "interview" | "ready" | "implementing" | null;
  planPath?: string;
  /** Open .xlsx tabs in the work-mode right panel. */
  workbookTabs?: WorkbookTabsState;
  /** Bumped to force active workbook preview reload. */
  workbookRefreshKey?: number;
  /** Transient structured question UI state (not persisted in history). */
  pendingQuestion?: PendingQuestionState | null;
  source?: "github-workflow";
  context?: "coding" | "work" | "work-project";
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
  planMode?: boolean;
  planPhase?: "interview" | "ready" | "implementing" | null;
  workbookTabs?: WorkbookTabsState;
  source?: "github-workflow";
  context?: "coding" | "work" | "work-project";
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
    planMode: input.planMode ?? false,
    planPhase: input.planPhase ?? null,
    pendingQuestion: null,
    workbookTabs: input.workbookTabs,
    source: input.source,
    context: input.context,
  };
}

export function runtimeIsStreaming(runtime: ConversationRuntime): boolean {
  return runtime.isStreaming || timelineIndicatesStreaming(runtime.timeline);
}

export function runtimeHasPlanDocument(
  runtime: Pick<ConversationRuntime, "planPhase"> | null | undefined,
): boolean {
  return runtime?.planPhase === "ready" || runtime?.planPhase === "implementing";
}

export const MAX_OPEN_WORKBOOK_TABS = 10;

export function normalizeWorkbookPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized.toLowerCase().endsWith(".xlsx")) return null;
  return normalized;
}

export function getActiveWorkbookPath(runtime: ConversationRuntime): string | undefined {
  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.length) return undefined;
  if (tabs.activePath && tabs.openPaths.includes(tabs.activePath)) {
    return tabs.activePath;
  }
  return tabs.openPaths[tabs.openPaths.length - 1];
}

export function openWorkbookTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeWorkbookPath(relativePath);
  if (!normalized) return false;

  const previous = runtime.workbookTabs?.openPaths ?? [];
  const without = previous.filter((path) => path !== normalized);
  let openPaths = [...without, normalized];
  if (openPaths.length > MAX_OPEN_WORKBOOK_TABS) {
    openPaths = openPaths.slice(openPaths.length - MAX_OPEN_WORKBOOK_TABS);
  }

  runtime.workbookTabs = {
    openPaths,
    activePath: normalized,
  };
  runtime.workbookRefreshKey = (runtime.workbookRefreshKey ?? 0) + 1;
  return true;
}

export function closeWorkbookTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeWorkbookPath(relativePath);
  if (!normalized) return false;

  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.length) return false;

  const openPaths = tabs.openPaths.filter((path) => path !== normalized);
  if (openPaths.length === tabs.openPaths.length) return false;

  let activePath = tabs.activePath;
  if (activePath === normalized) {
    activePath = openPaths[openPaths.length - 1];
  } else if (activePath && !openPaths.includes(activePath)) {
    activePath = openPaths[openPaths.length - 1];
  }

  runtime.workbookTabs =
    openPaths.length > 0 ? { openPaths, activePath } : undefined;
  return true;
}

export function setActiveWorkbookTab(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeWorkbookPath(relativePath);
  if (!normalized) return false;

  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.includes(normalized)) return false;
  if (tabs.activePath === normalized) return false;

  runtime.workbookTabs = { ...tabs, activePath: normalized };
  return true;
}

/** @deprecated Use openWorkbookTabOnRuntime */
export function touchWorkbookOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  return openWorkbookTabOnRuntime(runtime, relativePath);
}

export function bumpWorkbookRefresh(runtime: ConversationRuntime): void {
  runtime.workbookRefreshKey = (runtime.workbookRefreshKey ?? 0) + 1;
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
