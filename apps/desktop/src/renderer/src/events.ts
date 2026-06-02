import {
  emptyToolTotals,
  formatActiveToolLabel,
  formatConsolidatedSummary,
  incrementToolTotal,
  mergeToolTotals,
  migrateLegacyCounts,
  type LegacyToolCounts,
  type ToolActionTotals,
} from "./lib/tool-activity-summary";

export interface UserItem {
  kind: "user";
  id: string;
  content: string;
}

export interface AssistantItem {
  kind: "assistant";
  id: string;
  content: string;
  streaming?: boolean;
}

export interface ThinkingItem {
  kind: "thinking";
  id: string;
  active: boolean;
}

export interface ToolActivityItem {
  kind: "tool-activity";
  id: string;
  active: boolean;
  totals: ToolActionTotals;
  reasoning: boolean;
  currentAction?: string;
  swarmTasks?: string[];
  /** @deprecated Replaced by `totals` — kept for HMR / in-memory migration */
  counts?: LegacyToolCounts;
  /** @deprecated Replaced by `reasoning` */
  variant?: "reasoning";
  /** @deprecated Derived from totals at render time */
  summaryLines?: string[];
}

export type TimelineItem = UserItem | AssistantItem | ThinkingItem | ToolActivityItem;

export interface TimelineState {
  items: TimelineItem[];
}

/** @deprecated Use ToolActionTotals from tool-activity-summary */
export type ToolCounts = LegacyToolCounts;

let idCounter = 0;

export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createInitialTimelineState(): TimelineState {
  return { items: [] };
}

interface AgentMessage {
  role?: string;
  content?: unknown;
}

interface PiHarnessEvent {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  assistantMessageEvent?: {
    type: string;
    delta?: string;
    content?: string;
    error?: { errorMessage?: string; stopReason?: string };
  };
  message?: AgentMessage & { stopReason?: string; errorMessage?: string };
}

export function applyHarnessEvent(state: TimelineState, event: unknown): TimelineState {
  const e = event as PiHarnessEvent;
  let { items } = { items: consolidateTurnToolActivity(normalizeTimelineItems(state.items)) };

  if (e.type === "harness_exit") {
    return { items: finalizeAll(items) };
  }

  if (e.type === "agent_start") {
    return { items: upsertThinking(items) };
  }

  if (e.type === "agent_end") {
    return { items: finalizeAll(items) };
  }

  if (e.type === "tool_execution_start" && e.toolName) {
    items = removeThinking(finalizeReasoningOnBlock(items));
    return { items: upsertToolActivity(items, e.toolName, e.args, true) };
  }

  if (e.type === "tool_execution_end" && e.toolName) {
    items = clearCurrentAction(items);
    const discovered = countPathsInToolResult(e.result);
    if (discovered > 0) {
      return { items: bumpExploredFiles(items, discovered) };
    }
    return { items };
  }

  if (e.type === "message_update" && e.assistantMessageEvent) {
    const ame = e.assistantMessageEvent;
    if (ame.type === "thinking_start" || ame.type === "thinking_delta") {
      return { items: upsertReasoningActivity(items, true) };
    }
    if (ame.type === "thinking_end") {
      return { items: upsertReasoningActivity(items, false) };
    }
    if (ame.type === "text_delta" && ame.delta) {
      return { items: appendAssistantDelta(items, ame.delta) };
    }
    if (ame.type === "text_end" && ame.content) {
      return { items: setAssistantContent(items, ame.content, false) };
    }
    if (ame.type === "error") {
      const message = extractAssistantErrorMessage(ame.error);
      return {
        items: setAssistantContent(
          finalizeStreaming(removeThinking(finalizeReasoningOnBlock(items))),
          message,
          false,
        ),
      };
    }
    return state;
  }

  if (e.type === "message_end" && e.message) {
    if (e.message.role !== "assistant") {
      return state;
    }
    if (e.message.stopReason === "error" || e.message.stopReason === "aborted") {
      const message =
        e.message.errorMessage ??
        (e.message.stopReason === "aborted" ? "Stopped" : "The model returned an error");
      return {
        items: setAssistantContent(
          finalizeStreaming(removeThinking(finalizeReasoningOnBlock(items))),
          message,
          false,
        ),
      };
    }
    const text = extractMessageText(e.message);
    if (!shouldShowAssistantContent(text, items)) {
      return {
        items: finalizeAllToolActivity(
          finalizeReasoningOnBlock(removeThinking(items)),
          false,
        ),
      };
    }
    return { items: setAssistantContent(items, text, false) };
  }

  return state;
}

/** Show thinking shimmer immediately when the user sends a message. */
export function appendThinking(state: TimelineState): TimelineState {
  return { items: upsertThinking(state.items) };
}

/** Clear in-flight indicators after abort, disconnect, or completed turns. */
export function finalizeTimeline(state: TimelineState): TimelineState {
  return { items: finalizeAll(state.items) };
}

/** True when the timeline still shows an in-flight agent turn (even if isStreaming was cleared). */
export function timelineIndicatesStreaming(state: TimelineState): boolean {
  for (const item of state.items) {
    if (item.kind === "thinking" && item.active) return true;
    if (item.kind === "assistant" && item.streaming) return true;
    if (item.kind === "tool-activity" && item.active) return true;
  }
  return false;
}

function hasAssistantContentAfter(items: TimelineItem[], index: number): boolean {
  for (let i = index + 1; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "user") return false;
    if (item.kind === "assistant" && item.content.trim()) return true;
  }
  return false;
}

/** Hide stale or superseded tool activity when rendering a completed or idle chat. */
export function prepareTimelineForDisplay(
  items: TimelineItem[],
  isStreaming: boolean,
): TimelineItem[] {
  const consolidated = consolidateTurnToolActivity(items);
  return consolidated.filter((item, index) => {
    if (item.kind === "thinking") {
      return isStreaming;
    }
    if (item.kind !== "tool-activity") {
      return true;
    }
    if (hasAssistantContentAfter(consolidated, index)) {
      return false;
    }
    if (!isStreaming && item.active) {
      return false;
    }
    return getToolSummaryLine(item).length > 0;
  });
}

function ensureToolTotals(item: ToolActivityItem): ToolActionTotals {
  if (item.totals) return { ...item.totals, named: { ...item.totals.named } };
  if (item.counts) return migrateLegacyCounts(item.counts);
  return emptyToolTotals();
}

function buildSummaryLines(item: ToolActivityItem): string[] {
  const line = formatConsolidatedSummary({
    totals: ensureToolTotals(item),
    active: item.active,
    reasoning: item.reasoning || item.variant === "reasoning",
    currentAction: item.currentAction,
  });
  return line ? [line] : [];
}

function normalizeToolActivityItem(item: ToolActivityItem): ToolActivityItem {
  const reasoning = item.reasoning || item.variant === "reasoning";
  const normalized: ToolActivityItem = {
    kind: "tool-activity",
    id: item.id,
    active: item.active,
    totals: ensureToolTotals(item),
    reasoning,
    currentAction: item.currentAction,
    swarmTasks: item.swarmTasks?.slice(0, 10),
  };
  return { ...normalized, summaryLines: buildSummaryLines(normalized) };
}

function normalizeTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return items.map((item) =>
    item.kind === "tool-activity" ? normalizeToolActivityItem(item) : item,
  );
}

/** Safe read for render (handles HMR items that still have legacy `summary`). */
export function getToolSummaryLines(activity: ToolActivityItem): string[] {
  const lines = buildSummaryLines(normalizeToolActivityItem(activity));
  if (lines.length > 0) return lines;
  const legacy = (activity as ToolActivityItem & { summary?: string }).summary;
  if (typeof legacy === "string" && legacy.trim()) {
    return [legacy];
  }
  return lines;
}

export function getToolSummaryLine(activity: ToolActivityItem): string {
  return getToolSummaryLines(activity)[0] ?? "";
}

function lastUserIndex(items: TimelineItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.kind === "user") return i;
  }
  return -1;
}

function turnToolActivityIndices(items: TimelineItem[]): number[] {
  const start = lastUserIndex(items) + 1;
  const indices: number[] = [];
  for (let i = start; i < items.length; i++) {
    if (items[i]?.kind === "tool-activity") indices.push(i);
  }
  return indices;
}

function consolidateTurnToolActivity(items: TimelineItem[]): TimelineItem[] {
  const indices = turnToolActivityIndices(items);
  if (indices.length <= 1) {
    return normalizeTimelineItems(items);
  }

  let mergedTotals = emptyToolTotals();
  let reasoning = false;
  let active = false;
  let currentAction: string | undefined;
  const id = items[indices[0]!]!.kind === "tool-activity" ? (items[indices[0]!] as ToolActivityItem).id : nextId("tools");

  for (const index of indices) {
    const item = items[index] as ToolActivityItem;
    mergedTotals = mergeToolTotals(mergedTotals, ensureToolTotals(item));
    reasoning = reasoning || item.reasoning || item.variant === "reasoning";
    active = active || item.active;
    if (item.active && item.currentAction) currentAction = item.currentAction;
  }

  const consolidated: ToolActivityItem = normalizeToolActivityItem({
    kind: "tool-activity",
    id,
    active,
    totals: mergedTotals,
    reasoning,
    currentAction,
  });

  const removeSet = new Set(indices);
  const next = items.filter((_, index) => !removeSet.has(index));
  const insertAt = indices[0]!;
  next.splice(insertAt, 0, consolidated);
  return next;
}

function upsertThinking(items: TimelineItem[]): TimelineItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "thinking" && last.active) {
    return items;
  }
  return [
    ...items.filter((i) => i.kind !== "thinking"),
    { kind: "thinking", id: nextId("thinking"), active: true },
  ];
}

function removeThinking(items: TimelineItem[]): TimelineItem[] {
  return items.filter((i) => i.kind !== "thinking");
}

function getTurnToolActivity(items: TimelineItem[]): ToolActivityItem | undefined {
  const indices = turnToolActivityIndices(items);
  if (indices.length === 0) return undefined;
  return items[indices[indices.length - 1]!] as ToolActivityItem;
}

function replaceTurnToolActivity(items: TimelineItem[], block: ToolActivityItem): TimelineItem[] {
  const indices = turnToolActivityIndices(items);
  const normalized = normalizeToolActivityItem(block);
  if (indices.length === 0) {
    return insertToolActivity(items, normalized);
  }
  const removeSet = new Set(indices);
  const next = items.filter((_, index) => !removeSet.has(index));
  next.splice(indices[0]!, 0, normalized);
  return next;
}

function insertToolActivity(items: TimelineItem[], block: ToolActivityItem): TimelineItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "assistant" && last.streaming) {
    return [...items.slice(0, -1), block, last];
  }
  return [...items, block];
}

function upsertReasoningActivity(items: TimelineItem[], active: boolean): TimelineItem[] {
  items = removeThinking(items);
  const existing = getTurnToolActivity(items);

  if (existing) {
    return replaceTurnToolActivity(
      items,
      normalizeToolActivityItem({
        ...existing,
        active: active || existing.active,
        reasoning: true,
        currentAction: active ? "Reasoning" : undefined,
      }),
    );
  }

  if (!active) return items;

  return replaceTurnToolActivity(
    items,
    normalizeToolActivityItem({
      kind: "tool-activity",
      id: nextId("tools"),
      active: true,
      totals: emptyToolTotals(),
      reasoning: true,
      currentAction: "Reasoning",
    }),
  );
}

function finalizeReasoningOnBlock(items: TimelineItem[]): TimelineItem[] {
  const existing = getTurnToolActivity(items);
  if (!existing?.reasoning && existing?.variant !== "reasoning") return items;
  return replaceTurnToolActivity(
    items,
    normalizeToolActivityItem({
      ...existing,
      reasoning: true,
      currentAction: undefined,
    }),
  );
}

function countPathsInToolResult(result: PiHarnessEvent["result"]): number {
  const text = result?.content
    ?.map((c) => (c.type === "text" && c.text ? c.text : ""))
    .join("\n");
  if (!text) return 0;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const pathLines = lines.filter(
    (l) => l.startsWith("/") || /^[A-Za-z]:\\/.test(l) || l.startsWith("~/"),
  );
  return pathLines.length >= 3 ? pathLines.length : 0;
}

function bumpExploredFiles(items: TimelineItem[], fileCount: number): TimelineItem[] {
  const existing = getTurnToolActivity(items);
  const totals = existing ? ensureToolTotals(existing) : emptyToolTotals();
  totals.read = Math.max(totals.read, fileCount);

  const block = normalizeToolActivityItem({
    kind: "tool-activity",
    id: existing?.id ?? nextId("tools"),
    active: existing?.active ?? false,
    totals,
    reasoning: existing?.reasoning ?? false,
    currentAction: existing?.currentAction,
  });
  return replaceTurnToolActivity(items, block);
}

function extractSwarmTasks(toolName: string, args: unknown): string[] | undefined {
  if (toolName.toLowerCase() !== "swarm_dispatch") return undefined;
  if (!args || typeof args !== "object") return undefined;
  const rawTasks = (args as { tasks?: unknown }).tasks;
  if (!Array.isArray(rawTasks)) return undefined;

  const tasks = rawTasks
    .map((task) => extractSwarmTaskLabel(task))
    .filter((task): task is string => Boolean(task))
    .map((task) => task.trim())
    .filter((task) => task.length > 0)
    .slice(0, 10);
  return tasks.length > 0 ? tasks : undefined;
}

function extractSwarmTaskLabel(task: unknown): string | undefined {
  if (typeof task === "string") {
    const value = task.trim();
    return value.length > 0 ? value : undefined;
  }
  if (!task || typeof task !== "object") return undefined;

  const record = task as Record<string, unknown>;
  const candidates = [
    "task",
    "action",
    "prompt",
    "description",
    "title",
    "name",
    "operation",
    "command",
  ] as const;
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function upsertToolActivity(
  items: TimelineItem[],
  toolName: string,
  args: unknown,
  active: boolean,
): TimelineItem[] {
  const existing = getTurnToolActivity(items);
  const totals = incrementToolTotal(
    existing ? ensureToolTotals(existing) : emptyToolTotals(),
    toolName,
  );

  const block = normalizeToolActivityItem({
    kind: "tool-activity",
    id: existing?.id ?? nextId("tools"),
    active,
    totals,
    reasoning: existing?.reasoning ?? false,
    currentAction: formatActiveToolLabel(toolName, args),
    swarmTasks: extractSwarmTasks(toolName, args) ?? existing?.swarmTasks,
  });

  return replaceTurnToolActivity(items, block);
}

function clearCurrentAction(items: TimelineItem[]): TimelineItem[] {
  const existing = getTurnToolActivity(items);
  if (!existing?.currentAction) return items;
  return replaceTurnToolActivity(
    items,
    normalizeToolActivityItem({ ...existing, currentAction: undefined }),
  );
}

function removeToolActivity(items: TimelineItem[]): TimelineItem[] {
  return items.filter((item) => item.kind !== "tool-activity");
}

function finalizeAllToolActivity(items: TimelineItem[], active: boolean): TimelineItem[] {
  const indices = turnToolActivityIndices(items);
  if (indices.length === 0) return items;

  let mergedTotals = emptyToolTotals();
  let reasoning = false;
  let swarmTasks: string[] | undefined;
  const id = (items[indices[0]!] as ToolActivityItem).id;

  for (const index of indices) {
    const item = items[index] as ToolActivityItem;
    mergedTotals = mergeToolTotals(mergedTotals, ensureToolTotals(item));
    reasoning = reasoning || item.reasoning || item.variant === "reasoning";
    if (item.swarmTasks?.length) swarmTasks = item.swarmTasks;
  }

  const finalized = normalizeToolActivityItem({
    kind: "tool-activity",
    id,
    active,
    totals: mergedTotals,
    reasoning,
    currentAction: undefined,
    swarmTasks,
  });

  if (!active && buildSummaryLines(finalized).length === 0) {
    const removeSet = new Set(indices);
    return items.filter((_, index) => !removeSet.has(index));
  }

  const removeSet = new Set(indices);
  const next = items.filter((_, index) => !removeSet.has(index));
  next.splice(indices[0]!, 0, finalized);
  return next;
}

function appendAssistantDelta(items: TimelineItem[], delta: string): TimelineItem[] {
  items = removeThinking(finalizeReasoningOnBlock(removeToolActivity(items)));

  const last = items[items.length - 1];
  const nextContent = last?.kind === "assistant" && last.streaming ? last.content + delta : delta;

  if (!shouldShowAssistantContent(nextContent, items)) {
    return items;
  }

  if (last?.kind === "assistant" && last.streaming) {
    return [...items.slice(0, -1), { ...last, content: nextContent }];
  }

  return [
    ...items,
    {
      kind: "assistant",
      id: nextId("assistant"),
      content: delta,
      streaming: true,
    },
  ];
}

function setAssistantContent(
  items: TimelineItem[],
  content: string,
  streaming: boolean,
): TimelineItem[] {
  items = removeThinking(finalizeReasoningOnBlock(removeToolActivity(items)));

  if (!shouldShowAssistantContent(content, items)) {
    return stripEmptyAssistant(items);
  }

  const last = items[items.length - 1];
  if (last?.kind === "assistant") {
    return [...items.slice(0, -1), { ...last, content, streaming }];
  }

  return [
    ...items,
    {
      kind: "assistant",
      id: nextId("assistant"),
      content,
      streaming,
    },
  ];
}

function stripEmptyAssistant(items: TimelineItem[]): TimelineItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "assistant" && !last.content.trim()) {
    return items.slice(0, -1);
  }
  return items;
}

function getLastUserContent(items: TimelineItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === "user") return item.content.trim();
  }
  return undefined;
}

function isFilePathDump(text: string): boolean {
  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;
  const pathLike = lines.filter(
    (l) => l.startsWith("/") || /^[A-Za-z]:\\/.test(l) || l.startsWith("~/"),
  ).length;
  return pathLike / lines.length >= 0.6;
}

function shouldShowAssistantContent(text: string, items: TimelineItem[]): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lastUser = getLastUserContent(items);
  if (lastUser && trimmed === lastUser) return false;

  if (isFilePathDump(trimmed)) return false;

  return true;
}

function finalizeStreaming(items: TimelineItem[]): TimelineItem[] {
  return items.map((item) =>
    item.kind === "assistant" && item.streaming ? { ...item, streaming: false } : item,
  );
}

function finalizeAll(items: TimelineItem[]): TimelineItem[] {
  return removeThinking(
    finalizeReasoningOnBlock(finalizeAllToolActivity(finalizeStreaming(items), false)),
  );
}

function extractAssistantErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "The model returned an error";
  }
  const message = (error as { errorMessage?: string }).errorMessage;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  return "The model returned an error";
}

function extractMessageText(message: AgentMessage): string {
  const { content } = message;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "object" && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") return b.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** @deprecated use nextId */
export const nextMessageId = () => nextId("msg");
