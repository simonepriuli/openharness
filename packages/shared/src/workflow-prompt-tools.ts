import type { WorkflowTools } from "./workflow-run.js";
import { WORKFLOW_TOOL_GUIDELINES } from "./workflow-slash-tools.js";

export type WorkflowToolInvocation = { kind: "tool"; id: string };

const STATIC_TOOL_TOKEN_PATTERN = /\/tool:([a-z_]+)/g;

/** Extract static `/tool:` invocations from workflow instructions. */
export function extractToolInvocationsFromText(text: string): WorkflowToolInvocation[] {
  const seen = new Set<string>();
  const tools: WorkflowToolInvocation[] = [];
  for (const match of text.matchAll(STATIC_TOOL_TOKEN_PATTERN)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tools.push({ kind: "tool", id });
  }
  return tools;
}

export function expandWorkflowInstructions(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const prefixes: string[] = [];
  for (const tool of extractToolInvocationsFromText(trimmed)) {
    const guidelines = WORKFLOW_TOOL_GUIDELINES[tool.id];
    if (guidelines) {
      prefixes.push(guidelines.join("\n"));
    }
  }

  if (prefixes.length === 0) return trimmed;
  return [...prefixes, "", trimmed].join("\n");
}

export function appendWorkflowNotifyRequirements(
  instructions: string,
  tools?: WorkflowTools | null,
): string {
  const lines: string[] = [];
  if (tools?.discordNotify) {
    lines.push(
      "Discord notify is enabled. You MUST call post_discord_message with your final message before finishing.",
      "Do not report Discord delivery success unless post_discord_message returned success.",
    );
  }
  if (tools?.teamsNotify) {
    lines.push(
      "Teams notify is enabled. You MUST call post_teams_message with your final message before finishing.",
      "Do not report Teams delivery success unless post_teams_message returned success.",
    );
  }
  if (lines.length === 0) return instructions;
  return [...lines, "", instructions].join("\n");
}
