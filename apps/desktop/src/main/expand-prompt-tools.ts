import { readFileSync } from "node:fs";
import type { AttachedRoot } from "../shared/path-grants.js";
import type { ToolInvocation } from "../shared/thread-tools.js";
import { WORKFLOW_TOOL_GUIDELINES } from "../shared/workflow-slash-tools.js";

const WEB_SEARCH_GUIDELINES = [
  "Use web_search for current events, external documentation, libraries, APIs, and facts that are not in the project repository.",
  "Prefer grep/find/read for searching within the current codebase.",
  "Include specific, descriptive queries rather than vague keywords.",
  "Cite source URLs from results when sharing factual claims with the user.",
];

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return content;
  return content.slice(end + 5);
}

function expandSkillInvocation(invocation: Extract<ToolInvocation, { kind: "skill" }>): string | null {
  if (!invocation.filePath) return null;
  try {
    const content = readFileSync(invocation.filePath, "utf-8");
    const body = stripFrontmatter(content).trim();
    const baseDir = invocation.baseDir ?? invocation.filePath;
    return `<skill name="${invocation.name}" location="${invocation.filePath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`;
  } catch {
    return null;
  }
}

function expandToolInvocation(invocation: Extract<ToolInvocation, { kind: "tool" }>): string | null {
  if (invocation.id === "web_search") {
    return [
      "The user enabled Web Search for this message.",
      "Use the web_search tool when you need external or up-to-date information.",
      ...WEB_SEARCH_GUIDELINES,
    ].join("\n");
  }

  const workflowGuidelines = WORKFLOW_TOOL_GUIDELINES[invocation.id];
  if (workflowGuidelines) {
    return workflowGuidelines.join("\n");
  }

  return null;
}

function expandAttachedRoots(roots: AttachedRoot[]): string | null {
  if (roots.length === 0) return null;
  const lines = [
    "The user attached external files or folders to this conversation.",
    "Use the absolute paths below directly in read_xlsx, edit_xlsx, read_docx, edit_docx, read_pdf, convert_pdf_to_md, and read tools.",
    "Use read_pdf for .pdf files — the generic read tool cannot parse PDF content.",
    "The thread working directory is separate from these external locations.",
    "",
    "Attached roots:",
  ];
  for (const root of roots) {
    const kindLabel = root.kind === "folder" ? "folder" : "file";
    lines.push(`- ${root.label} (${kindLabel}): ${root.absolutePath}`);
  }
  return lines.join("\n");
}

export function expandPromptTools(
  message: string,
  tools: ToolInvocation[],
  attachedRoots: AttachedRoot[] = [],
): string {
  const prefixes: string[] = [];
  const attachedBlock = expandAttachedRoots(attachedRoots);
  if (attachedBlock) prefixes.push(attachedBlock);

  if (tools.length > 0) {
    for (const tool of tools) {
      const block =
        tool.kind === "skill" ? expandSkillInvocation(tool) : expandToolInvocation(tool);
      if (block) prefixes.push(block);
    }
  }

  if (prefixes.length === 0) return message;
  const trimmed = message.trim();
  if (!trimmed) return prefixes.join("\n\n");
  return `${prefixes.join("\n\n")}\n\n${trimmed}`;
}
