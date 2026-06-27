import { runHeadlessPiPrompt } from "./workflow-pi.js";
import { fallbackResultMarkdown, stripJsonBlocks } from "./workflow-run-result.js";

export { fallbackResultMarkdown } from "./workflow-run-result.js";

const MAX_INPUT_CHARS = 24_000;

function parseModelRef(model: string): { provider: string; modelId: string } | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

function buildSummarizationPrompt(options: {
  assistantText: string;
  workflowName: string;
  event: string;
}): string {
  const input =
    options.assistantText.length > MAX_INPUT_CHARS
      ? `${options.assistantText.slice(0, MAX_INPUT_CHARS)}\n\n[truncated]`
      : options.assistantText;

  return `You summarize completed OpenHarness workflow runs for a team dashboard.

Workflow: ${options.workflowName}
Trigger: ${options.event}

Write a concise markdown report for humans based on the agent output below.
- Use headings and bullet lists when helpful.
- Do not include JSON code blocks.
- Focus on outcomes, findings, actions taken, and open risks.
- Keep it under 800 words.

Agent output:
${input}`;
}

export async function summarizeWorkflowRun(options: {
  assistantText: string;
  workflowName: string;
  event: string;
  projectPath: string;
  modelRef: string;
}): Promise<string> {
  const trimmed = options.assistantText.trim();
  if (!trimmed) return "";

  const fallback = fallbackResultMarkdown(trimmed);
  const model = parseModelRef(options.modelRef);
  if (!model) return fallback;

  try {
    const result = await runHeadlessPiPrompt({
      cwd: options.projectPath,
      prompt: buildSummarizationPrompt({
        assistantText: trimmed,
        workflowName: options.workflowName,
        event: options.event,
      }),
      model,
    });
    const summary = stripJsonBlocks(result.assistantText).trim();
    return summary || fallback;
  } catch {
    return fallback;
  }
}
