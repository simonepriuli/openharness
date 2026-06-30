import {
  CheckListIcon,
  CodeIcon,
  Heading03Icon,
  Heading1Icon,
  Heading2Icon,
  Heading4Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  SeparatorHorizontalIcon,
  TableIcon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type MarkdownSlashCommandId =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "bullet-list"
  | "numbered-list"
  | "todo-list"
  | "code-block"
  | "quote"
  | "table"
  | "divider"
  | "link";

export type MarkdownSlashCommand = {
  id: MarkdownSlashCommandId;
  label: string;
  section: string;
  shortcut?: string;
  icon: IconSvgElement;
  keywords: string[];
};

export const MARKDOWN_SLASH_COMMANDS: MarkdownSlashCommand[] = [
  {
    id: "text",
    label: "Text",
    section: "Basic blocks",
    icon: TextIcon,
    keywords: ["text", "paragraph", "plain"],
  },
  {
    id: "heading1",
    label: "Heading 1",
    section: "Basic blocks",
    shortcut: "#",
    icon: Heading1Icon,
    keywords: ["heading", "h1", "title"],
  },
  {
    id: "heading2",
    label: "Heading 2",
    section: "Basic blocks",
    shortcut: "##",
    icon: Heading2Icon,
    keywords: ["heading", "h2", "subtitle"],
  },
  {
    id: "heading3",
    label: "Heading 3",
    section: "Basic blocks",
    shortcut: "###",
    icon: Heading03Icon,
    keywords: ["heading", "h3"],
  },
  {
    id: "heading4",
    label: "Heading 4",
    section: "Basic blocks",
    shortcut: "####",
    icon: Heading4Icon,
    keywords: ["heading", "h4"],
  },
  {
    id: "bullet-list",
    label: "Bulleted list",
    section: "Basic blocks",
    shortcut: "-",
    icon: LeftToRightListBulletIcon,
    keywords: ["bullet", "list", "unordered", "ul"],
  },
  {
    id: "numbered-list",
    label: "Numbered list",
    section: "Basic blocks",
    shortcut: "1.",
    icon: LeftToRightListNumberIcon,
    keywords: ["numbered", "ordered", "list", "ol"],
  },
  {
    id: "todo-list",
    label: "To-do list",
    section: "Basic blocks",
    shortcut: "[]",
    icon: CheckListIcon,
    keywords: ["todo", "task", "check", "checkbox", "checklist"],
  },
  {
    id: "code-block",
    label: "Code",
    section: "Basic blocks",
    shortcut: "```",
    icon: CodeIcon,
    keywords: ["code", "snippet", "pre"],
  },
  {
    id: "quote",
    label: "Quote",
    section: "Basic blocks",
    shortcut: ">",
    icon: LeftToRightBlockQuoteIcon,
    keywords: ["quote", "blockquote"],
  },
  {
    id: "table",
    label: "Table",
    section: "Basic blocks",
    shortcut: "|",
    icon: TableIcon,
    keywords: ["table", "grid", "spreadsheet", "rows", "columns"],
  },
  {
    id: "divider",
    label: "Divider",
    section: "Basic blocks",
    shortcut: "---",
    icon: SeparatorHorizontalIcon,
    keywords: ["divider", "separator", "horizontal", "rule", "hr", "line"],
  },
  {
    id: "link",
    label: "Link",
    section: "Basic blocks",
    icon: Link01Icon,
    keywords: ["link", "url", "href"],
  },
];

export function filterMarkdownSlashCommands(
  commands: MarkdownSlashCommand[],
  query: string,
): MarkdownSlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;

  return commands.filter((command) => {
    if (command.label.toLowerCase().includes(normalized)) return true;
    if (command.shortcut?.toLowerCase().includes(normalized)) return true;
    return command.keywords.some((keyword) => keyword.includes(normalized));
  });
}

export function groupMarkdownSlashCommands(
  commands: MarkdownSlashCommand[],
): Array<{ section: string; items: MarkdownSlashCommand[] }> {
  const groups = new Map<string, MarkdownSlashCommand[]>();
  for (const command of commands) {
    const existing = groups.get(command.section) ?? [];
    existing.push(command);
    groups.set(command.section, existing);
  }
  return [...groups.entries()].map(([section, items]) => ({ section, items }));
}
