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
  summaryLines: string[];
  counts: ToolCounts;
  /** Non-tool progress (e.g. model extended thinking) — not driven by tool counts. */
  variant?: "reasoning";
}

export type TimelineItem = UserItem | AssistantItem | ThinkingItem | ToolActivityItem;

export interface TimelineState {
  items: TimelineItem[];
}

export interface ToolCounts {
  files: number;
  searches: number;
  fetches: number;
  commands: number;
  other: number;
}

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
  let { items } = { items: normalizeTimelineItems(state.items) };

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
    items = removeThinking(finalizeReasoningActivity(items, false));
    return { items: upsertToolActivity(items, e.toolName, true) };
  }

  if (e.type === "tool_execution_end" && e.toolName) {
    const discovered = countPathsInToolResult(e.result);
    if (discovered > 0) {
      return { items: addDiscoveredFiles(items, discovered) };
    }
    return state;
  }

  if (e.type === "message_update" && e.assistantMessageEvent) {
    const ame = e.assistantMessageEvent;
    if (
      ame.type === "thinking_start" ||
      ame.type === "thinking_delta"
    ) {
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
          finalizeStreaming(removeThinking(finalizeReasoningActivity(items, false))),
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
          finalizeStreaming(removeThinking(finalizeReasoningActivity(items, false))),
          message,
          false,
        ),
      };
    }
    const text = extractMessageText(e.message);
    if (!shouldShowAssistantContent(text, items)) {
      return {
        items: finalizeAllToolActivity(
          finalizeReasoningActivity(removeThinking(items), false),
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
  return items.filter((item, index) => {
    if (item.kind === "thinking") {
      return isStreaming;
    }
    if (item.kind !== "tool-activity") {
      return true;
    }
    if (hasAssistantContentAfter(items, index)) {
      return false;
    }
    if (!isStreaming && item.active) {
      return false;
    }
    return getToolSummaryLines(item).length > 0;
  });
}

function emptyCounts(): ToolCounts {
  return { files: 0, searches: 0, fetches: 0, commands: 0, other: 0 };
}

function ensureToolCounts(counts?: Partial<ToolCounts>): ToolCounts {
  return { ...emptyCounts(), ...counts };
}

function categorizeTool(toolName: string): keyof ToolCounts {
  const n = toolName.toLowerCase();
  if (
    n.includes("read") ||
    n.includes("write") ||
    n.includes("edit") ||
    n.includes("file") ||
    n === "ls" ||
    n.includes("glob")
  ) {
    return "files";
  }
  if (n.includes("grep") || n.includes("search") || n.includes("find") || n.includes("rg")) {
    return "searches";
  }
  if (n.includes("fetch") || n.includes("web") || n.includes("http") || n.includes("curl")) {
    return "fetches";
  }
  if (n === "bash" || n.includes("shell") || n.includes("exec") || n.includes("run")) {
    return "commands";
  }
  return "other";
}

function formatExplorationParts(counts: ToolCounts): string[] {
  const parts: string[] = [];
  if (counts.files > 0) {
    parts.push(`${counts.files} file${counts.files === 1 ? "" : "s"}`);
  }
  if (counts.searches > 0) {
    parts.push(`${counts.searches} search${counts.searches === 1 ? "" : "es"}`);
  }
  if (counts.fetches > 0) {
    parts.push(`${counts.fetches} fetch${counts.fetches === 1 ? "" : "es"}`);
  }
  return parts;
}

function formatToolSummaryLines(counts: ToolCounts, active: boolean): string[] {
  const fileOps = counts.files;
  const onlyFiles =
    fileOps > 0 &&
    counts.searches === 0 &&
    counts.fetches === 0 &&
    counts.commands === 0 &&
    counts.other === 0;
  const onlyCommands =
    counts.commands > 0 &&
    fileOps === 0 &&
    counts.searches === 0 &&
    counts.fetches === 0 &&
    counts.other === 0;

  if (onlyFiles) {
    return [
      active
        ? `Exploring ${fileOps} file${fileOps === 1 ? "" : "s"}…`
        : `Explored ${fileOps} file${fileOps === 1 ? "" : "s"}`,
    ];
  }

  if (onlyCommands) {
    const n = counts.commands;
    return [
      active
        ? `Running ${n} command${n === 1 ? "" : "s"}…`
        : `Ran ${n} command${n === 1 ? "" : "s"}`,
    ];
  }

  const lines: string[] = [];
  const explorationParts = formatExplorationParts(counts);

  if (explorationParts.length > 0) {
    const joined = explorationParts.join(", ");
    lines.push(active ? `Exploring ${joined}…` : `Explored ${joined}`);
  }

  if (counts.commands > 0) {
    const n = counts.commands;
    lines.push(
      active
        ? `Running ${n} command${n === 1 ? "" : "s"}…`
        : `Ran ${n} command${n === 1 ? "" : "s"}`,
    );
  }

  if (counts.other > 0) {
    const n = counts.other;
    lines.push(
      active
        ? `Using ${n} tool${n === 1 ? "" : "s"}…`
        : `Used ${n} tool${n === 1 ? "" : "s"}`,
    );
  }

  if (lines.length === 0) {
    return active ? ["Working…"] : [];
  }

  return lines;
}

function reasoningSummaryLines(active: boolean): string[] {
  return active ? ["Reasoning…"] : ["Reasoned"];
}

function normalizeToolActivityItem(item: ToolActivityItem): ToolActivityItem {
  const counts = ensureToolCounts(item.counts);
  if (item.variant === "reasoning") {
    return {
      ...item,
      counts,
      summaryLines: reasoningSummaryLines(item.active),
    };
  }
  return {
    kind: "tool-activity",
    id: item.id,
    active: item.active,
    counts,
    summaryLines: formatToolSummaryLines(counts, item.active),
  };
}

function normalizeTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return items.map((item) =>
    item.kind === "tool-activity" ? normalizeToolActivityItem(item) : item,
  );
}

/** Safe read for render (handles HMR items that still have legacy `summary`). */
export function getToolSummaryLines(activity: ToolActivityItem): string[] {
  const lines = normalizeToolActivityItem(activity).summaryLines;
  if (lines.length > 0) return lines;
  const legacy = (activity as ToolActivityItem & { summary?: string }).summary;
  if (typeof legacy === "string" && legacy.trim()) {
    return [legacy];
  }
  return lines;
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

function isReasoningActivity(item: TimelineItem | undefined): item is ToolActivityItem {
  return item?.kind === "tool-activity" && item.variant === "reasoning";
}

function upsertReasoningActivity(items: TimelineItem[], active: boolean): TimelineItem[] {
  items = removeThinking(items);
  const last = items[items.length - 1];
  const summaryLines = reasoningSummaryLines(active);

  if (isReasoningActivity(last)) {
    if (!active && !last.active) {
      return items;
    }
    return [
      ...items.slice(0, -1),
      { ...last, active, summaryLines },
    ];
  }

  if (!active) {
    return items;
  }

  return [
    ...items,
    {
      kind: "tool-activity",
      id: nextId("reasoning"),
      active: true,
      variant: "reasoning",
      counts: emptyCounts(),
      summaryLines,
    },
  ];
}

function finalizeReasoningActivity(items: TimelineItem[], active: boolean): TimelineItem[] {
  const last = items[items.length - 1];
  if (!isReasoningActivity(last)) {
    return items;
  }
  if (!active) {
    return [...items.slice(0, -1), { ...last, active: false, summaryLines: reasoningSummaryLines(false) }];
  }
  return items;
}

function countPathsInToolResult(
  result: PiHarnessEvent["result"],
): number {
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

function addDiscoveredFiles(items: TimelineItem[], fileCount: number): TimelineItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "tool-activity") {
    const counts = ensureToolCounts(last.counts);
    counts.files = Math.max(counts.files, fileCount);
    return [
      ...items.slice(0, -1),
      {
        ...last,
        counts,
        summaryLines: formatToolSummaryLines(counts, last.active),
      },
    ];
  }
  const counts = emptyCounts();
  counts.files = fileCount;
  return [
    ...items,
    {
      kind: "tool-activity",
      id: nextId("tools"),
      active: false,
      counts,
      summaryLines: formatToolSummaryLines(counts, false),
    },
  ];
}

function upsertToolActivity(items: TimelineItem[], toolName: string, active: boolean): TimelineItem[] {
  const category = categorizeTool(toolName);
  const last = items[items.length - 1];

  if (last?.kind === "tool-activity" && last.active) {
    const counts = ensureToolCounts(last.counts);
    counts[category] += 1;
    return [
      ...items.slice(0, -1),
      { ...last, counts, summaryLines: formatToolSummaryLines(counts, active), active },
    ];
  }

  const counts = emptyCounts();
  counts[category] = 1;
  const toolItem: ToolActivityItem = {
    kind: "tool-activity",
    id: nextId("tools"),
    active,
    counts,
    summaryLines: formatToolSummaryLines(counts, active),
  };

  if (last?.kind === "assistant" && last.streaming) {
    return [...items.slice(0, -1), toolItem, last];
  }

  return [...items, toolItem];
}

function removeToolActivity(items: TimelineItem[]): TimelineItem[] {
  return items.filter((item) => item.kind !== "tool-activity");
}

function finalizeAllToolActivity(items: TimelineItem[], active: boolean): TimelineItem[] {
  return items.flatMap((item): TimelineItem[] => {
    if (item.kind !== "tool-activity") return [item];
    const summaryLines =
      item.variant === "reasoning"
        ? reasoningSummaryLines(active)
        : formatToolSummaryLines(ensureToolCounts(item.counts), active);
    if (!active && summaryLines.length === 0) return [];
    return [{ ...item, active, summaryLines }];
  });
}

function appendAssistantDelta(items: TimelineItem[], delta: string): TimelineItem[] {
  items = removeThinking(finalizeReasoningActivity(removeToolActivity(items), false));

  const last = items[items.length - 1];
  const nextContent = last?.kind === "assistant" && last.streaming ? last.content + delta : delta;

  if (!shouldShowAssistantContent(nextContent, items)) {
    return items;
  }

  if (last?.kind === "assistant" && last.streaming) {
    return [
      ...items.slice(0, -1),
      { ...last, content: nextContent },
    ];
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
  items = removeThinking(finalizeReasoningActivity(removeToolActivity(items), false));

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
    finalizeReasoningActivity(finalizeAllToolActivity(finalizeStreaming(items), false), false),
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
