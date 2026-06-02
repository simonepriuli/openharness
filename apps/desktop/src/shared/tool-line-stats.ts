export interface ToolLineStats {
  linesAdded: number;
  linesRemoved: number;
  isCreate?: boolean;
}

/** Count +/− lines in pi edit-tool display diff (`+123 …` / `−123 …`). */
export function countDisplayDiffLineStats(diff: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (/^\+\s*\d+/.test(line)) linesAdded += 1;
    else if (/^-\s*\d+/.test(line)) linesRemoved += 1;
  }
  return { linesAdded, linesRemoved };
}

/** Count +/− lines in a unified diff patch. */
export function countUnifiedPatchLineStats(patch: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) linesAdded += 1;
    else if (line.startsWith("-")) linesRemoved += 1;
  }
  return { linesAdded, linesRemoved };
}

export function countTextLines(content: string): number {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized) return 0;
  return normalized.split("\n").length;
}

export function extractPathFromEditResultText(text: string): string | undefined {
  const match = text.match(/\bin\s+(\S+)/);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\.$/, "");
}

export function extractPathFromWriteResultText(text: string): string | undefined {
  const match = text.match(/\bto\s+(\S+)/);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\.$/, "");
}

export function extractToolResultText(
  content: Array<{ type?: string; text?: string }> | undefined,
): string {
  if (!content) return "";
  return content
    .map((c) => (c.type === "text" && c.text ? c.text : ""))
    .join("\n");
}

export function resolveLineStatsFromToolResult(options: {
  toolName: string;
  resultText: string;
  diff?: string;
  patch?: string;
  writeContent?: string;
}): ToolLineStats | undefined {
  const name = options.toolName.toLowerCase();

  if (name === "edit") {
    if (typeof options.diff === "string" && options.diff.length > 0) {
      const stats = countDisplayDiffLineStats(options.diff);
      if (stats.linesAdded > 0 || stats.linesRemoved > 0) return stats;
    }
    if (typeof options.patch === "string" && options.patch.length > 0) {
      const stats = countUnifiedPatchLineStats(options.patch);
      if (stats.linesAdded > 0 || stats.linesRemoved > 0) return stats;
    }
    return { linesAdded: 0, linesRemoved: 0 };
  }

  if (name === "write") {
    const lines = countTextLines(options.writeContent ?? "");
    if (lines > 0) {
      return { linesAdded: lines, linesRemoved: 0 };
    }
    return { linesAdded: 0, linesRemoved: 0 };
  }

  return undefined;
}
