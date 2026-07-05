export const LINEAR_AGENT_DEFAULT_INSTRUCTIONS =
  "You are the OpenHarness Linear agent. Use the repository worktree and Linear tools to help with the issue described in the session context.";

export const LINEAR_AGENT_BEHAVIOR_GUIDELINES = [
  "If the user's @mention or message is a question (for example asking how something works, whether a feature exists, or seeking clarification), answer the question only.",
  "Do not modify code, push branches, open pull requests, or start implementation work unless the user explicitly asks you to implement, fix, or change something.",
].join("\n");

function withLinearAgentBehaviorGuidelines(instructions: string): string {
  return [LINEAR_AGENT_BEHAVIOR_GUIDELINES, "", instructions].join("\n");
}

function readLinearAgentUserPrompt(run: {
  payload: Record<string, unknown>;
}): string {
  return typeof run.payload.userPrompt === "string" ? run.payload.userPrompt.trim() : "";
}

function readLinearAgentIssueSummary(run: {
  payload: Record<string, unknown>;
}): string {
  const issue = run.payload.issue;
  if (!issue || typeof issue !== "object") return "";

  return Object.entries(issue as Record<string, unknown>)
    .filter(([key, value]) => key !== "description" && value != null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

/** Minimal message for Pi session resume — the saved session already has prior context. */
export function buildLinearAgentFollowUpPrompt(run: {
  payload: Record<string, unknown>;
}): string {
  const userPrompt = readLinearAgentUserPrompt(run);
  if (userPrompt) return userPrompt;

  const promptContext =
    typeof run.payload.promptContext === "string" ? run.payload.promptContext.trim() : "";
  return promptContext || "Please continue.";
}

/** Lighter prompt for comment follow-ups when no Pi session exists yet. */
export function buildLinearAgentPromptedRunPrompt(
  run: import("../linear-agent/linear-agent-run.js").LinearAgentRunExecutionRecord,
  branch: string,
  config: import("../linear-agent/linear-agent-run.js").LinearAgentConfigSnapshot | null,
): string {
  const instructions = withLinearAgentBehaviorGuidelines(
    config?.instructions?.trim() || LINEAR_AGENT_DEFAULT_INSTRUCTIONS,
  );
  const userPrompt = readLinearAgentUserPrompt(run);
  const issueBlock = readLinearAgentIssueSummary(run);

  const sections = [
    instructions,
    "",
    `Repository: ${run.namespace}/${run.repoName}`,
    `Branch: ${branch}`,
    "",
    "--- USER MESSAGE ---",
    userPrompt || "(no user message from Linear)",
  ];

  if (issueBlock) {
    sections.push("", "--- ISSUE ---", issueBlock);
  }

  return sections.join("\n");
}

export function resolveLinearAgentPiPrompt(
  run: import("../linear-agent/linear-agent-run.js").LinearAgentRunExecutionRecord,
  branch: string,
  config: import("../linear-agent/linear-agent-run.js").LinearAgentConfigSnapshot | null,
  options: { sessionMode: "new" | "resume" },
): string {
  if (run.trigger !== "prompted") {
    return buildLinearAgentPrompt(run, branch, config);
  }

  if (options.sessionMode === "resume") {
    return buildLinearAgentFollowUpPrompt(run);
  }

  return buildLinearAgentPromptedRunPrompt(run, branch, config);
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
  const userPrompt = readLinearAgentUserPrompt(run);
  const issueBlock = readLinearAgentIssueSummary(run);

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
