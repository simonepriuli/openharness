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

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
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
      return path ? `Reading ${basename(path)}` : "Reading file";
    }
    case "write": {
      const path = shortenPath(String(a.path ?? a.file_path ?? ""));
      return path ? `Writing ${basename(path)}` : "Writing file";
    }
    case "edit": {
      const path = shortenPath(String(a.path ?? a.file_path ?? ""));
      return path ? `Editing ${basename(path)}` : "Editing file";
    }
    case "bash": {
      const raw = String(a.command ?? "").replace(/[\n\t]/g, " ").trim();
      const cmd = raw.slice(0, 48);
      return cmd ? `Running \`${cmd}${raw.length > 48 ? "…" : ""}\`` : "Running command";
    }
    case "grep": {
      const pattern = String(a.pattern ?? "").trim();
      const path = shortenPath(String(a.path ?? "."));
      return pattern ? `Searching \`/${pattern}/\` in ${basename(path)}` : "Searching";
    }
    case "find": {
      const pattern = String(a.pattern ?? "").trim();
      const path = shortenPath(String(a.path ?? "."));
      return pattern ? `Finding \`${pattern}\` in ${basename(path)}` : "Finding files";
    }
    case "ls": {
      const path = shortenPath(String(a.path ?? "."));
      return `Listing ${basename(path)}`;
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
}): string {
  const { totals, active, reasoning, currentAction } = options;
  const parts: string[] = [];

  const edited = totals.edit + totals.write;
  if (edited > 0) {
    parts.push(
      active
        ? `editing ${edited} ${plural(edited, "file")}`
        : `edited ${edited} ${plural(edited, "file")}`,
    );
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
