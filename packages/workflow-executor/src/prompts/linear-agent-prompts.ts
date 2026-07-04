export function buildLinearAgentPrompt(
  run: import("../linear-agent/linear-agent-run.js").LinearAgentRunExecutionRecord,
  branch: string,
  config: import("../linear-agent/linear-agent-run.js").LinearAgentConfigSnapshot | null,
): string {
  const instructions =
    config?.instructions?.trim() ||
    "You are the OpenHarness Linear agent. Use the repository worktree and Linear tools to help with the issue described in the session context.";

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
