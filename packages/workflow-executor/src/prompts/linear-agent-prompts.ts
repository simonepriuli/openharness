export const LINEAR_AGENT_DEFAULT_INSTRUCTIONS =
  "You are the OpenHarness Linear agent. Use the repository worktree and Linear tools to help with the issue described in the session context.";

export const LINEAR_AGENT_BEHAVIOR_GUIDELINES = [
  "If the user's @mention or message is a question (for example asking how something works, whether a feature exists, or seeking clarification), answer the question only.",
  "Do not modify code, push branches, open pull requests, or start implementation work unless the user explicitly asks you to implement, fix, or change something.",
].join("\n");

function withLinearAgentBehaviorGuidelines(instructions: string): string {
  return [LINEAR_AGENT_BEHAVIOR_GUIDELINES, "", instructions].join("\n");
}

export function buildLinearAgentPrompt(
  run: import("../linear-agent/linear-agent-run.js").LinearAgentRunExecutionRecord,
  branch: string,
  config: import("../linear-agent/linear-agent-run.js").LinearAgentConfigSnapshot | null,
): string {
  const instructions = withLinearAgentBehaviorGuidelines(
    config?.instructions?.trim() || LINEAR_AGENT_DEFAULT_INSTRUCTIONS,
  );

  const promptContext =
    typeof run.payload.promptContext === "string" ? run.payload.promptContext.trim() : "";
  const userPrompt =
    typeof run.payload.userPrompt === "string" ? run.payload.userPrompt.trim() : "";

  const issue = run.payload.issue;
  const issueBlock =
    issue && typeof issue === "object"
      ? Object.entries(issue as Record<string, unknown>)
          .filter(([, value]) => value != null && value !== "")
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join("\n")
      : "";

  const sections = [
    instructions,
    "",
    `Repository: ${run.namespace}/${run.repoName}`,
    `Branch: ${branch}`,
    `Trigger: ${run.trigger}`,
    "",
    "--- LINEAR AGENT SESSION ---",
    promptContext || "(no promptContext from Linear)",
  ];

  if (userPrompt) {
    sections.push("", "--- USER FOLLOW-UP ---", userPrompt);
  }

  if (issueBlock) {
    sections.push("", "--- ISSUE ---", issueBlock);
  }

  return sections.join("\n");
}
