import {
  extractPathFromEditResultText,
  extractPathFromWriteResultText,
  extractToolResultText,
  resolveLineStatsFromToolResult,
  type ToolLineStats,
} from "../shared/tool-line-stats.js";
import { gitLineStatsForFile } from "./git-line-stats.js";

type ToolExecutionEndEvent = {
  type: "tool_execution_end";
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    details?: { diff?: string; patch?: string };
  };
  lineStats?: ToolLineStats;
  isCreate?: boolean;
};

function extractPath(toolName: string, resultText: string, args: unknown): string | undefined {
  const fromArgs = extractPathFromToolArgs(args);
  if (fromArgs) return fromArgs;
  const lower = toolName.toLowerCase();
  if (lower === "write") return extractPathFromWriteResultText(resultText);
  if (lower === "edit") return extractPathFromEditResultText(resultText);
  return undefined;
}

function extractPathFromToolArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  const raw = String(record.path ?? record.file_path ?? "").trim();
  return raw || undefined;
}

function writeContentFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const content = (args as Record<string, unknown>).content;
  return typeof content === "string" ? content : undefined;
}

export async function enrichToolExecutionEnd(
  cwd: string,
  event: ToolExecutionEndEvent,
): Promise<ToolExecutionEndEvent> {
  const toolName = event.toolName ?? "";
  const lower = toolName.toLowerCase();
  if (lower !== "edit" && lower !== "write") {
    return event;
  }

  const resultText = extractToolResultText(event.result?.content);
  const filePath = extractPath(toolName, resultText, event.args);
  if (!filePath) return event;

  const details = event.result?.details;
  let stats =
    resolveLineStatsFromToolResult({
      toolName,
      resultText,
      diff: details?.diff,
      patch: details?.patch,
      writeContent: lower === "write" ? writeContentFromArgs(event.args) : undefined,
    }) ?? undefined;

  if (!stats || (stats.linesAdded === 0 && stats.linesRemoved === 0)) {
    const gitStats = await gitLineStatsForFile(cwd, filePath);
    if (gitStats) stats = gitStats;
  }

  if (!stats) return event;

  return {
    ...event,
    lineStats: stats,
    isCreate: stats.isCreate,
  };
}
