import {
  createInitialTimelineState,
  nextId,
  type ToolActivityItem,
  type ToolLineItem,
  type TimelineItem,
  type TimelineState,
} from "../events";
import {
  countDisplayDiffLineStats,
  countUnifiedPatchLineStats,
  emptyToolTotals,
  extractFilePathFromArgs,
  extractPathFromEditResultText,
  extractPathFromWriteResultText,
  fileBasename,
  fileOperationForTool,
  formatSupplementSummary,
  incrementToolTotal,
  type ToolActionTotals,
} from "./tool-activity-summary";

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

interface RpcMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  details?: { diff?: string; patch?: string };
}

interface ToolCallBlock {
  type?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

class TurnSupplementActivity {
  totals: ToolActionTotals = emptyToolTotals();

  ingestToolResult(message: RpcMessage): void {
    const toolName = message.toolName ?? "tool";
    if (fileOperationForTool(toolName)) return;
    this.totals = incrementToolTotal(this.totals, toolName);
  }

  hasContent(): boolean {
    const { grep, find, ls, bash, named } = this.totals;
    if (grep + find + ls + bash > 0) return true;
    return Object.keys(named).length > 0;
  }

  toItem(): ToolActivityItem | undefined {
    const supplement = formatSupplementSummary({
      totals: this.totals,
      active: false,
      reasoning: false,
    });
    if (!supplement) return undefined;
    return {
      kind: "tool-activity",
      id: nextId("tools"),
      active: false,
      totals: this.totals,
      reasoning: false,
    };
  }
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function registerToolCalls(content: unknown, toolCallsById: Map<string, ToolCallBlock>): void {
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as ToolCallBlock;
    if (block.type !== "toolCall" || !block.id || !block.name) continue;
    toolCallsById.set(block.id, block);
  }
}

function lineStatsFromToolResult(message: RpcMessage): {
  linesAdded?: number;
  linesRemoved?: number;
} {
  const diff = message.details?.diff;
  if (typeof diff === "string" && diff.length > 0) {
    return countDisplayDiffLineStats(diff);
  }
  const patch = message.details?.patch;
  if (typeof patch === "string" && patch.length > 0) {
    return countUnifiedPatchLineStats(patch);
  }
  return {};
}

function toolLineFromResult(
  message: RpcMessage,
  toolCallsById: Map<string, ToolCallBlock>,
): ToolLineItem | undefined {
  const toolName = message.toolName ?? "";
  const operation = fileOperationForTool(toolName);
  if (!operation) return undefined;

  const call = message.toolCallId ? toolCallsById.get(message.toolCallId) : undefined;
  const resultText = extractTextFromContent(message.content);
  const rawPath =
    extractFilePathFromArgs(call?.arguments) ||
    (operation === "write"
      ? extractPathFromWriteResultText(resultText)
      : extractPathFromEditResultText(resultText));
  if (!rawPath) return undefined;

  const path = fileBasename(shortenPath(rawPath));
  const stats = lineStatsFromToolResult(message);

  return {
    kind: "tool-line",
    id: nextId("tool"),
    path,
    operation,
    active: false,
    toolCallId: message.toolCallId,
    linesAdded: stats.linesAdded,
    linesRemoved: stats.linesRemoved,
  };
}

export function messagesToTimeline(messages: unknown[] | null): TimelineState {
  if (!messages?.length) return createInitialTimelineState();

  const items: TimelineItem[] = [];
  const toolCallsById = new Map<string, ToolCallBlock>();
  let supplement: TurnSupplementActivity | null = null;

  const flushSupplement = () => {
    const block = supplement?.toItem();
    if (block) items.push(block);
    supplement = null;
  };

  for (const raw of messages) {
    const msg = raw as RpcMessage;

    if (msg.role === "user") {
      flushSupplement();
      toolCallsById.clear();
      const text = extractTextFromContent(msg.content);
      if (text) {
        items.push({ kind: "user", id: nextId("user"), content: text });
      }
      supplement = new TurnSupplementActivity();
      continue;
    }

    if (msg.role === "assistant") {
      registerToolCalls(msg.content, toolCallsById);
      const text = extractTextFromContent(msg.content);
      if (text) {
        flushSupplement();
        items.push({ kind: "assistant", id: nextId("assistant"), content: text });
      }
      continue;
    }

    if (msg.role === "toolResult") {
      const line = toolLineFromResult(msg, toolCallsById);
      if (line) {
        items.push(line);
        continue;
      }
      if (!supplement) supplement = new TurnSupplementActivity();
      supplement.ingestToolResult(msg);
    }
  }

  flushSupplement();
  return { items };
}
