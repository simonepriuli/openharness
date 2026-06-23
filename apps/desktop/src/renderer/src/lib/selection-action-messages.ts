import { formatFileMention } from "./file-mention";

export type SelectionActionId =
  | "explain"
  | "bug-discovery"
  | "refactor"
  | "add-tests"
  | "document";

export type SelectionLineRange = {
  start: number;
  end: number;
};

export type SelectionActionDefinition = {
  id: SelectionActionId;
  label: string;
  prompt: string;
};

export const SELECTION_ACTIONS: SelectionActionDefinition[] = [
  { id: "explain", label: "Explain", prompt: "Explain this code" },
  { id: "bug-discovery", label: "Bug discovery", prompt: "Find potential bugs in this code" },
  { id: "refactor", label: "Refactor", prompt: "Suggest how to refactor this code" },
  { id: "add-tests", label: "Add tests", prompt: "Write tests for this code" },
  { id: "document", label: "Document", prompt: "Write documentation for this code" },
];

const FENCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".dockerfile": "dockerfile",
  ".vue": "vue",
  ".svelte": "svelte",
};

export function inferFenceLanguage(relativePath: string): string {
  const dot = relativePath.lastIndexOf(".");
  if (dot === -1) return "";
  const ext = relativePath.slice(dot).toLowerCase();
  return FENCE_LANGUAGE_BY_EXTENSION[ext] ?? "";
}

function formatLineRangeHint(lineRange?: SelectionLineRange): string {
  if (!lineRange) return "";
  if (lineRange.start === lineRange.end) {
    return ` (line ${lineRange.start})`;
  }
  return ` (lines ${lineRange.start}-${lineRange.end})`;
}

export function buildSelectionActionMessage(
  actionId: SelectionActionId,
  relativePath: string,
  selectedText: string,
  lineRange?: SelectionLineRange,
): string {
  const action = SELECTION_ACTIONS.find((item) => item.id === actionId);
  const prompt = action?.prompt ?? "Review this code";
  const mention = formatFileMention(relativePath);
  const lineHint = formatLineRangeHint(lineRange);
  const language = inferFenceLanguage(relativePath);
  const fenceOpen = language ? `\`\`\`${language}` : "```";

  return `${prompt}${lineHint} from ${mention}:\n\n${fenceOpen}\n${selectedText}\n\`\`\``;
}
