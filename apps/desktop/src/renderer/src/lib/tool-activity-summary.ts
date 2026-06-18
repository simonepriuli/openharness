import {
  countDisplayDiffLineStats,
  countTextLines,
  countUnifiedPatchLineStats,
  extractPathFromEditResultText,
  extractPathFromWriteResultText,
  extractRawFilePathFromArgs,
  type ToolLineStats,
} from "../../../shared/tool-line-stats";

export {
  countDisplayDiffLineStats,
  countTextLines,
  countUnifiedPatchLineStats,
  extractPathFromEditResultText,
  extractPathFromWriteResultText,
  extractRawFilePathFromArgs,
};
export type { ToolLineStats };

/** Per-file line stats from a completed edit tool call. */
export interface FileEditStats {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

export type FileToolOperation = "edit" | "write" | "read";

export function fileOperationForTool(toolName: string): FileToolOperation | undefined {
  switch (toolName.toLowerCase()) {
    case "edit":
      return "edit";
    case "write":
      return "write";
    case "read":
      return "read";
    default:
      return undefined;
  }
}

export function formatToolLineLabel(
  operation: FileToolOperation,
  active: boolean,
  path: string,
  isCreate = false,
): string {
  if (isCreate) {
    return active ? `Creating ${path}` : `Created ${path}`;
  }
  const [present, past] =
    operation === "edit"
      ? (["Editing", "Edited"] as const)
      : operation === "write"
        ? (["Writing", "Written"] as const)
        : (["Reading", "Explored"] as const);
  return `${active ? present : past} ${path}`;
}

export function extractFilePathFromArgs(args: unknown): string | undefined {
  const record = asRecord(args);
  const raw = String(record.path ?? record.file_path ?? "").trim();
  if (!raw) return undefined;
  return fileBasename(shortenPath(raw));
}

/** @deprecated Use extractFilePathFromArgs */
export const extractEditPathFromArgs = extractFilePathFromArgs;

export interface ToolActionTotals {
  read: number;
  write: number;
  edit: number;
  grep: number;
  find: number;
  ls: number;
  bash: number;
  /** Custom tool names (e.g. lints, Task) → invocation count */
  named: Record<string, number>;
}

export function emptyToolTotals(): ToolActionTotals {
  return { read: 0, write: 0, edit: 0, grep: 0, find: 0, ls: 0, bash: 0, named: {} };
}

export function mergeToolTotals(a: ToolActionTotals, b: ToolActionTotals): ToolActionTotals {
  const named = { ...a.named };
  for (const [key, count] of Object.entries(b.named)) {
    named[key] = (named[key] ?? 0) + count;
  }
  return {
    read: a.read + b.read,
    write: a.write + b.write,
    edit: a.edit + b.edit,
    grep: a.grep + b.grep,
    find: a.find + b.find,
    ls: a.ls + b.ls,
    bash: a.bash + b.bash,
    named,
  };
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

/** Project-relative or home-shortened path for file-edit summaries. */
export function formatFilePathForDisplay(path: string): string {
  return shortenPath(path.replace(/\\/g, "/"));
}

export function extractDisplayFilePathFromArgs(args: unknown): string | undefined {
  const record = asRecord(args);
  const raw = String(record.path ?? record.file_path ?? "").trim();
  if (!raw) return undefined;
  return formatFilePathForDisplay(raw);
}

/** Merge completed edit/write tool lines into per-file stats (sums duplicate paths). */
export function consolidateFileEditLines(
  lines: Array<{
    path: string;
    operation: FileToolOperation;
    linesAdded?: number;
    linesRemoved?: number;
    isCreate?: boolean;
  }>,
): Array<FileEditStats & { isCreate?: boolean }> {
  const map = new Map<string, { linesAdded: number; linesRemoved: number; isCreate?: boolean }>();
  for (const line of lines) {
    if (line.operation !== "edit" && line.operation !== "write") continue;
    const existing = map.get(line.path) ?? { linesAdded: 0, linesRemoved: 0, isCreate: line.isCreate };
    map.set(line.path, {
      linesAdded: existing.linesAdded + (line.linesAdded ?? 0),
      linesRemoved: existing.linesRemoved + (line.linesRemoved ?? 0),
      isCreate: existing.isCreate || line.isCreate,
    });
  }
  return [...map.entries()].map(([path, stats]) => ({ path, ...stats }));
}

export function fileBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

/** @deprecated Use countDisplayDiffLineStats from shared/tool-line-stats */
export const countDiffLineStats = countDisplayDiffLineStats;

export function resolveStoredLineStats(options: {
  toolName: string;
  diff?: string;
  patch?: string;
  writeContent?: string;
  lineStats?: ToolLineStats;
  isCreate?: boolean;
}): { linesAdded?: number; linesRemoved?: number; isCreate?: boolean } {
  if (options.lineStats) {
    return {
      linesAdded: options.lineStats.linesAdded,
      linesRemoved: options.lineStats.linesRemoved,
      isCreate: options.lineStats.isCreate ?? options.isCreate,
    };
  }

  const name = options.toolName.toLowerCase();
  if (name === "edit") {
    if (typeof options.diff === "string" && options.diff.length > 0) {
      const stats = countDisplayDiffLineStats(options.diff);
      return { linesAdded: stats.linesAdded, linesRemoved: stats.linesRemoved };
    }
    if (typeof options.patch === "string" && options.patch.length > 0) {
      const stats = countUnifiedPatchLineStats(options.patch);
      return { linesAdded: stats.linesAdded, linesRemoved: stats.linesRemoved };
    }
  }

  if (name === "write" && options.writeContent) {
    const lines = countTextLines(options.writeContent);
    return { linesAdded: lines, linesRemoved: 0 };
  }

  return {};
}

export function mergeFileEdits(a: FileEditStats[], b: FileEditStats[]): FileEditStats[] {
  return [...a, ...b];
}

export function ingestEditToolResult(options: {
  fileEdits: FileEditStats[];
  path?: string;
  diff?: string;
}): FileEditStats[] {
  const path = options.path;
  if (!path) return options.fileEdits;
  const diff = options.diff;
  const { linesAdded, linesRemoved } =
    typeof diff === "string" && diff.length > 0
      ? countDisplayDiffLineStats(diff)
      : { linesAdded: 0, linesRemoved: 0 };
  return mergeFileEdits(options.fileEdits, [{ path, linesAdded, linesRemoved }]);
}

/** Non-file-edit parts of the turn summary (explored, lints, bash, …). */
export function formatSupplementSummary(options: {
  totals: ToolActionTotals;
  active: boolean;
  reasoning: boolean;
  currentAction?: string;
}): string {
  const totals = { ...options.totals, edit: 0, write: 0 };
  return formatConsolidatedSummary({ ...options, totals, fileEdits: [] });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function incrementNamed(totals: ToolActionTotals, toolName: string): ToolActionTotals {
  const key = toolName.trim();
  if (!key) return totals;
  return {
    ...totals,
    named: { ...totals.named, [key]: (totals.named[key] ?? 0) + 1 },
  };
}

export function incrementToolTotal(totals: ToolActionTotals, toolName: string): ToolActionTotals {
  const name = toolName.toLowerCase();
  switch (name) {
    case "read":
      return { ...totals, read: totals.read + 1 };
    case "write":
      return { ...totals, write: totals.write + 1 };
    case "edit":
      return { ...totals, edit: totals.edit + 1 };
    case "grep":
      return { ...totals, grep: totals.grep + 1 };
    case "find":
      return { ...totals, find: totals.find + 1 };
    case "ls":
      return { ...totals, ls: totals.ls + 1 };
    case "bash":
      return { ...totals, bash: totals.bash + 1 };
    default:
      return incrementNamed(totals, toolName);
  }
}

export function formatActiveToolLabel(toolName: string, args: unknown): string {
  const a = asRecord(args);
  const name = toolName.toLowerCase();

  switch (name) {
    case "read": {
      const path = shortenPath(String(a.path ?? a.file_path ?? ""));
      return path ? `Reading ${fileBasename(path)}` : "Reading file";
    }
    case "write": {
      const path = shortenPath(String(a.path ?? a.file_path ?? ""));
      return path ? `Writing ${fileBasename(path)}` : "Writing file";
    }
    case "edit": {
      const path = shortenPath(String(a.path ?? a.file_path ?? ""));
      return path ? `Editing ${fileBasename(path)}` : "Editing file";
    }
    case "bash": {
      const raw = String(a.command ?? "").replace(/[\n\t]/g, " ").trim();
      const cmd = raw.slice(0, 48);
      return cmd ? `Running \`${cmd}${raw.length > 48 ? "…" : ""}\`` : "Running command";
    }
    case "grep": {
      const pattern = String(a.pattern ?? "").trim();
      const path = shortenPath(String(a.path ?? "."));
      return pattern ? `Searching \`/${pattern}/\` in ${fileBasename(path)}` : "Searching";
    }
    case "find": {
      const pattern = String(a.pattern ?? "").trim();
      const path = shortenPath(String(a.path ?? "."));
      return pattern ? `Finding \`${pattern}\` in ${fileBasename(path)}` : "Finding files";
    }
    case "ls": {
      const path = shortenPath(String(a.path ?? "."));
      return `Listing ${fileBasename(path)}`;
    }
    case "web_search": {
      const query = String(a.query ?? "").trim();
      if (!query) return "Searching the web";
      const preview = query.length > 48 ? `${query.slice(0, 48)}…` : query;
      return `Searching the web for "${preview}"`;
    }
    default:
      return `Running ${toolName}`;
  }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function formatNamedToolLabel(name: string, count: number, active: boolean): string {
  if (count === 1 && !active) return name;
  if (count === 1 && active) return name;
  return `${count} ${name}`;
}

export function formatConsolidatedSummary(options: {
  totals: ToolActionTotals;
  active: boolean;
  reasoning: boolean;
  currentAction?: string;
  /** When set, file-edit labels are shown separately with diff stats. */
  fileEdits?: FileEditStats[];
}): string {
  const { totals, active, reasoning, currentAction, fileEdits = [] } = options;
  const parts: string[] = [];

  if (fileEdits.length === 1) {
    parts.push(active ? `editing ${fileEdits[0]!.path}` : `Edited ${fileEdits[0]!.path}`);
  } else if (fileEdits.length > 1) {
    parts.push(
      active
        ? `editing ${fileEdits.length} ${plural(fileEdits.length, "file")}`
        : `Edited ${fileEdits.length} ${plural(fileEdits.length, "file")}`,
    );
  } else {
    const edited = totals.edit + totals.write;
    if (edited > 0) {
      parts.push(
        active
          ? `editing ${edited} ${plural(edited, "file")}`
          : `edited ${edited} ${plural(edited, "file")}`,
      );
    }
  }

  const explored = totals.read + totals.ls;
  if (explored > 0) {
    parts.push(
      active
        ? `exploring ${explored} ${plural(explored, "file")}`
        : `explored ${explored} ${plural(explored, "file")}`,
    );
  }

  const searches = totals.grep + totals.find;
  if (searches > 0) {
    parts.push(
      active
        ? `${searches} ${plural(searches, "search")}`
        : `${searches} ${plural(searches, "search")}`,
    );
  }

  for (const [name, count] of Object.entries(totals.named).sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(formatNamedToolLabel(name, count, active));
  }

  if (totals.bash > 0) {
    parts.push(
      active
        ? `running ${totals.bash} ${plural(totals.bash, "command")}`
        : `ran ${totals.bash} ${plural(totals.bash, "command")}`,
    );
  }

  if (reasoning) {
    if (active && currentAction?.toLowerCase() === "reasoning") {
      parts.push("reasoning");
    } else if (!active) {
      parts.push("reasoned");
    }
  }

  if (parts.length === 0) {
    if (currentAction) return active ? `${currentAction}…` : currentAction;
    return active ? "Working…" : "";
  }

  if (active && currentAction && currentAction.toLowerCase() !== "reasoning") {
    parts.push(currentAction.charAt(0).toLowerCase() + currentAction.slice(1));
  }

  let summary = parts.join(", ");
  if (active) summary += "…";
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function formatToolActivityDisplay(options: {
  totals: ToolActionTotals;
  active: boolean;
  reasoning: boolean;
  currentAction?: string;
  fileEdits?: FileEditStats[];
}): { text: string; linesAdded: number; linesRemoved: number } | null {
  const fileEdits = options.fileEdits ?? [];
  const linesAdded = fileEdits.reduce((sum, edit) => sum + edit.linesAdded, 0);
  const linesRemoved = fileEdits.reduce((sum, edit) => sum + edit.linesRemoved, 0);
  const text = formatConsolidatedSummary({ ...options, fileEdits });
  if (!text) return null;
  return { text, linesAdded, linesRemoved };
}

/** @deprecated Legacy aggregate counts — migrated at read time. */
export interface LegacyToolCounts {
  files: number;
  searches: number;
  fetches: number;
  commands: number;
  other: number;
}

export function migrateLegacyCounts(counts: LegacyToolCounts): ToolActionTotals {
  const totals = emptyToolTotals();
  totals.read = Math.max(0, counts.files);
  totals.grep = Math.max(0, counts.searches);
  totals.bash = Math.max(0, counts.commands);
  if (counts.other > 0) totals.named.other = counts.other;
  if (counts.fetches > 0) totals.named.fetch = counts.fetches;
  return totals;
}
