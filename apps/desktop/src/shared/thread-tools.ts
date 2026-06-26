import { isWorkflowToolId, WORKFLOW_TOOL_CATALOG } from "./workflow-slash-tools.js";

export type ToolSection = "tools" | "skills" | "workflow" | "attach";

export type SlashMenuAction = "attach-file-or-folder";

export type ThreadToolDefinition = {
  id: string;
  label: string;
  description: string;
  section: ToolSection;
  iconClassName?: string;
};

export type SlashMenuItem = {
  toolId: string;
  label: string;
  description: string;
  section: ToolSection;
  filePath?: string;
  baseDir?: string;
  iconClassName?: string;
  action?: SlashMenuAction;
};

export type ToolInvocation =
  | { kind: "tool"; id: string }
  | { kind: "skill"; name: string; filePath?: string; baseDir?: string };

export const THREAD_TOOL_CATALOG: ThreadToolDefinition[] = [
  {
    id: "web_search",
    label: "Web Search",
    description: "Search the web for current information via Exa.",
    section: "tools",
    iconClassName: "tool-icon-web-search",
  },
];

export interface SlashRange {
  query: string;
  start: number;
  end: number;
}

export type MessagePart =
  | { type: "text"; value: string }
  | { type: "mention"; relativePath: string }
  | { type: "tool"; toolId: string; label: string; section: ToolSection };

const MESSAGE_TOOL_PATTERN = /\/tool:([a-z_]+)|\/skill:([a-z0-9-]+)/g;
const STATIC_TOOL_TOKEN_PATTERN = /\/tool:([a-z_]+)/g;

export function formatToolToken(toolId: string): string {
  if (toolId.startsWith("skill:")) {
    return `/skill:${toolId.slice("skill:".length)}`;
  }
  return `/tool:${toolId}`;
}

export function toolLabelFromId(toolId: string): string {
  if (toolId.startsWith("skill:")) {
    return toolId.slice("skill:".length);
  }
  const catalogEntry =
    THREAD_TOOL_CATALOG.find((entry) => entry.id === toolId) ??
    WORKFLOW_TOOL_CATALOG.find((entry) => entry.id === toolId);
  return catalogEntry?.label ?? toolId.replace(/_/g, " ");
}

export function toolSectionFromId(toolId: string): ToolSection {
  if (toolId.startsWith("skill:")) return "skills";
  if (isWorkflowToolId(toolId)) return "workflow";
  return "tools";
}

export function toolIconClassName(toolId: string, section: ToolSection): string | undefined {
  if (section === "skills") return undefined;
  if (section === "workflow" || isWorkflowToolId(toolId)) return "tool-icon-workflow";
  const normalizedId = toolId.startsWith("skill:") ? toolId.slice("skill:".length) : toolId;
  const catalogEntry = THREAD_TOOL_CATALOG.find((entry) => entry.id === normalizedId);
  return catalogEntry?.iconClassName;
}

/** Active `/query` token at the cursor, if any. */
export function getSlashAtCursor(value: string, cursor: number): SlashRange | null {
  const before = value.slice(0, cursor);
  const match = before.match(/\/([^\s/]*)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = cursor - match[0].length;
  return { query, start, end: cursor };
}

export function filterSlashMenuItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    const haystack = `${item.label} ${item.toolId} ${item.description}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function groupSlashMenuItems(
  items: SlashMenuItem[],
): Array<{ section: ToolSection; label: string; items: SlashMenuItem[] }> {
  const sections: Array<{ section: ToolSection; label: string; items: SlashMenuItem[] }> = [
    { section: "attach", label: "Attach", items: [] },
    { section: "tools", label: "Tools", items: [] },
    { section: "workflow", label: "Pull request", items: [] },
    { section: "skills", label: "Skills", items: [] },
  ];
  for (const item of items) {
    const bucket = sections.find((section) => section.section === item.section);
    bucket?.items.push(item);
  }
  return sections.filter((section) => section.items.length > 0);
}

/** Flat list of slash items in the same order shown in the picker (grouped by section). */
export function listSelectableSlashMenuItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const filtered = filterSlashMenuItems(items, query);
  return groupSlashMenuItems(filtered).flatMap((group) => group.items);
}

/** Split user message text into plain text, @mentions, and /tool tokens. */
export function parseMessageParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;

  const mentionPattern = /@"([^"]+)"|@([^\s@]+)/g;
  const combined = new RegExp(
    `${mentionPattern.source}|${MESSAGE_TOOL_PATTERN.source}`,
    "g",
  );

  for (const match of content.matchAll(combined)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, index) });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      const relativePath = match[1] ?? match[2] ?? "";
      if (relativePath) {
        parts.push({ type: "mention", relativePath });
      }
    } else if (match[3] !== undefined) {
      const toolId = match[3];
      parts.push({
        type: "tool",
        toolId,
        label: toolLabelFromId(toolId),
        section: toolSectionFromId(toolId),
      });
    } else if (match[4] !== undefined) {
      const skillName = match[4];
      const toolId = `skill:${skillName}`;
      parts.push({
        type: "tool",
        toolId,
        label: toolLabelFromId(toolId),
        section: "skills",
      });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: content }];
}

/** Extract static `/tool:` invocations from serialized text (ignores `/skill:` tokens). */
export function extractToolInvocationsFromText(text: string): ToolInvocation[] {
  const seen = new Set<string>();
  const tools: ToolInvocation[] = [];
  for (const match of text.matchAll(STATIC_TOOL_TOKEN_PATTERN)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tools.push({ kind: "tool", id });
  }
  return tools;
}

export function isWorkConversationContext(
  context: "coding" | "work" | "work-project" | undefined,
): boolean {
  return context === "work" || context === "work-project";
}

export function buildAttachSlashMenuItems(): SlashMenuItem[] {
  return [
    {
      toolId: "attach-file-or-folder",
      label: "File or folder…",
      description: "Attach an external file or folder to this conversation.",
      section: "attach",
      action: "attach-file-or-folder",
    },
  ];
}

export function slashMenuItemToInvocation(item: SlashMenuItem): ToolInvocation {
  if (item.action) {
    throw new Error(`Slash menu action "${item.action}" is not a tool invocation.`);
  }
  if (item.section === "skills") {
    const name = item.toolId.startsWith("skill:") ? item.toolId.slice("skill:".length) : item.toolId;
    return {
      kind: "skill",
      name,
      ...(item.filePath ? { filePath: item.filePath } : {}),
      ...(item.baseDir ? { baseDir: item.baseDir } : {}),
    };
  }
  return { kind: "tool", id: item.toolId };
}

export type PiSlashCommandLike = {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo?: {
    path: string;
    baseDir?: string;
  };
};

export function mapPiCommandsToSlashMenuItems(commands: PiSlashCommandLike[]): SlashMenuItem[] {
  return commands
    .filter((command) => command.source === "skill")
    .map((command) => ({
      toolId: command.name,
      label: command.name.startsWith("skill:") ? command.name.slice("skill:".length) : command.name,
      description: command.description ?? "",
      section: "skills" as const,
      ...(command.sourceInfo?.path ? { filePath: command.sourceInfo.path } : {}),
      ...(command.sourceInfo?.baseDir ? { baseDir: command.sourceInfo.baseDir } : {}),
    }));
}

export function mergeSlashMenuItems(
  staticItems: SlashMenuItem[],
  skillItems: SlashMenuItem[],
): SlashMenuItem[] {
  const seen = new Set<string>();
  const merged: SlashMenuItem[] = [];
  for (const item of [...staticItems, ...skillItems]) {
    if (seen.has(item.toolId)) continue;
    seen.add(item.toolId);
    merged.push(item);
  }
  return merged;
}
