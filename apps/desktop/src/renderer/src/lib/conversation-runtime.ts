import type { ComposerSegment } from "./composer-draft";
import type { PendingQuestionState } from "./pending-question";
import type { StoredAttachedRoot } from "./chat-db";
import { createInitialTimelineState, timelineIndicatesStreaming, type TimelineState } from "../events";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type WorkbookTabsState = {
  openPaths: string[];
  activePath?: string;
  /** Last-viewed worksheet name per open workbook path. */
  activeSheetByPath?: Record<string, string>;
};

/** @alias WorkbookTabsState — persisted storage key remains `workbookTabs`. */
export type OfficeTabsState = WorkbookTabsState;

export type OfficeFileKind = "docx" | "xlsx" | "md";

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
  /** Open .docx / .xlsx / .md tabs in the work-mode right panel. */
  workbookTabs?: WorkbookTabsState;
  /** Bumped to force active office document preview reload. */
  workbookRefreshKey?: number;
  /** Transient structured question UI state (not persisted in history). */
  pendingQuestion?: PendingQuestionState | null;
  /** External file/folder grants for work-mode threads. */
  attachedRoots?: StoredAttachedRoot[];
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
  attachedRoots?: StoredAttachedRoot[];
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
    attachedRoots: input.attachedRoots,
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
export const MAX_OPEN_OFFICE_TABS = MAX_OPEN_WORKBOOK_TABS;

export function officeFileKindFromPath(filePath: string): OfficeFileKind | null {
  const normalized = filePath.replace(/\\/g, "/").trim().toLowerCase();
  if (normalized.endsWith(".xlsx")) return "xlsx";
  if (normalized.endsWith(".docx")) return "docx";
  if (normalized.endsWith(".md")) return "md";
  return null;
}

export function normalizeOfficePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!officeFileKindFromPath(normalized)) return null;
  return normalized;
}

export function normalizeWorkbookPath(filePath: string): string | null {
  const normalized = normalizeOfficePath(filePath);
  if (!normalized || !normalized.toLowerCase().endsWith(".xlsx")) return null;
  return normalized;
}

export function getActiveOfficePath(runtime: ConversationRuntime): string | undefined {
  return getActiveWorkbookPath(runtime);
}

export function getActiveOfficeFileKind(runtime: ConversationRuntime): OfficeFileKind | undefined {
  const activePath = getActiveOfficePath(runtime);
  if (!activePath) return undefined;
  return officeFileKindFromPath(activePath) ?? undefined;
}

export function getActiveWorkbookPath(runtime: ConversationRuntime): string | undefined {
  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.length) return undefined;
  if (tabs.activePath && tabs.openPaths.includes(tabs.activePath)) {
    return tabs.activePath;
  }
  return tabs.openPaths[tabs.openPaths.length - 1];
}

export function openOfficeTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeOfficePath(relativePath);
  if (!normalized) return false;

  const previous = runtime.workbookTabs?.openPaths ?? [];
  const without = previous.filter((path) => path !== normalized);
  let openPaths = [...without, normalized];
  if (openPaths.length > MAX_OPEN_OFFICE_TABS) {
    openPaths = openPaths.slice(openPaths.length - MAX_OPEN_OFFICE_TABS);
  }

  runtime.workbookTabs = {
    openPaths,
    activePath: normalized,
    ...(runtime.workbookTabs?.activeSheetByPath
      ? { activeSheetByPath: runtime.workbookTabs.activeSheetByPath }
      : {}),
  };
  runtime.workbookRefreshKey = (runtime.workbookRefreshKey ?? 0) + 1;
  return true;
}

export function openWorkbookTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeWorkbookPath(relativePath);
  if (!normalized) return false;
  return openOfficeTabOnRuntime(runtime, normalized);
}

export function closeOfficeTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeOfficePath(relativePath);
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

  const activeSheetByPath = { ...tabs.activeSheetByPath };
  delete activeSheetByPath[normalized];

  runtime.workbookTabs =
    openPaths.length > 0
      ? {
          openPaths,
          activePath,
          ...(Object.keys(activeSheetByPath).length > 0 ? { activeSheetByPath } : {}),
        }
      : undefined;
  return true;
}

export function closeWorkbookTabOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  return closeOfficeTabOnRuntime(runtime, relativePath);
}

export function setActiveOfficeTab(runtime: ConversationRuntime, relativePath: string): boolean {
  const normalized = normalizeOfficePath(relativePath);
  if (!normalized) return false;

  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.includes(normalized)) return false;
  if (tabs.activePath === normalized) return false;

  runtime.workbookTabs = { ...tabs, activePath: normalized };
  return true;
}

export function setActiveWorkbookTab(runtime: ConversationRuntime, relativePath: string): boolean {
  return setActiveOfficeTab(runtime, relativePath);
}

/** @deprecated Use openOfficeTabOnRuntime */
export function touchWorkbookOnRuntime(runtime: ConversationRuntime, relativePath: string): boolean {
  return openOfficeTabOnRuntime(runtime, relativePath);
}

export function bumpOfficeRefresh(runtime: ConversationRuntime): void {
  runtime.workbookRefreshKey = (runtime.workbookRefreshKey ?? 0) + 1;
}

export function bumpWorkbookRefresh(runtime: ConversationRuntime): void {
  bumpOfficeRefresh(runtime);
}

export function getActiveWorkbookSheet(
  runtime: ConversationRuntime,
  relativePath?: string,
): string | undefined {
  const path = relativePath ?? getActiveWorkbookPath(runtime);
  if (!path) return undefined;
  return runtime.workbookTabs?.activeSheetByPath?.[path];
}

export function setActiveWorkbookSheetOnRuntime(
  runtime: ConversationRuntime,
  relativePath: string,
  sheetName: string,
): boolean {
  const normalizedPath = normalizeWorkbookPath(relativePath);
  const normalizedSheet = sheetName.trim();
  if (!normalizedPath || !normalizedSheet) return false;

  const tabs = runtime.workbookTabs;
  if (!tabs?.openPaths.includes(normalizedPath)) return false;
  if (tabs.activeSheetByPath?.[normalizedPath] === normalizedSheet) return false;

  runtime.workbookTabs = {
    ...tabs,
    activeSheetByPath: {
      ...tabs.activeSheetByPath,
      [normalizedPath]: normalizedSheet,
    },
  };
  return true;
}

export function clearActiveWorkbookSheetOnRuntime(
  runtime: ConversationRuntime,
  relativePath: string,
): boolean {
  const normalizedPath = normalizeWorkbookPath(relativePath);
  if (!normalizedPath) return false;

  const tabs = runtime.workbookTabs;
  if (!tabs?.activeSheetByPath?.[normalizedPath]) return false;

  const activeSheetByPath = { ...tabs.activeSheetByPath };
  delete activeSheetByPath[normalizedPath];

  runtime.workbookTabs = {
    ...tabs,
    activeSheetByPath:
      Object.keys(activeSheetByPath).length > 0 ? activeSheetByPath : undefined,
  };
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function extractSheetFromXlsxToolArgs(toolName: string, args: unknown): string | undefined {
  const normalizedTool = toolName.toLowerCase();
  const record = asRecord(args);

  if (normalizedTool === "read_xlsx") {
    const sheet = String(record.sheet ?? "").trim();
    return sheet || undefined;
  }

  if (normalizedTool !== "edit_xlsx") return undefined;

  const operations = record.operations ?? record.patch;
  if (!Array.isArray(operations)) return undefined;

  for (const op of operations) {
    const opRecord = asRecord(op);
    const opType = String(opRecord.op ?? "").toLowerCase();

    if (opType === "add_sheet") {
      const name = String(opRecord.name ?? "").trim();
      if (name) return name;
    }
    if (opType === "rename_sheet") {
      const to = String(opRecord.to ?? "").trim();
      if (to) return to;
    }
    if (opType === "delete_sheet") {
      const sheet = String(opRecord.sheet ?? "").trim();
      if (sheet) return sheet;
    }
  }

  for (const op of operations) {
    const opRecord = asRecord(op);
    const sheet = String(opRecord.sheet ?? "").trim();
    if (sheet) return sheet;
  }

  return undefined;
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
