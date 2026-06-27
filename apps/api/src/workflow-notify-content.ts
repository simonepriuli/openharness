export const DISCORD_MAX_MESSAGE_LENGTH = 2000;
export const TEAMS_MAX_MESSAGE_LENGTH = 4000;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function chunkText(lines: string[], maxLength: number): string[] {
  const messages: string[] = [];
  let current = "";

  for (const line of lines) {
    const separator = current.length > 0 ? "\n" : "";
    const candidate = `${current}${separator}${line}`;
    if (candidate.length > maxLength) {
      if (current) messages.push(current);
      current = line.length > maxLength ? clip(line, maxLength) : line;
    } else {
      current = candidate;
    }
  }

  if (current) messages.push(current);
  return messages.length > 0 ? messages : [""];
}

export function buildWorkflowNotifyMessages(options: {
  workflowName: string;
  repoFullName: string;
  assistantText: string;
  maxChunkLength: number;
}): string[] {
  const lines = [
    `**${options.workflowName}**`,
    `Repository: \`${options.repoFullName}\``,
    "",
  ];
  const body = options.assistantText.trim();
  if (body) {
    lines.push(...body.split("\n"));
  }
  return chunkText(lines, options.maxChunkLength);
}

export function buildWorkflowFailedMessage(options: {
  repoFullName: string;
  errorMessage: string;
}): string {
  return `**Workflow failed**\nRepository: \`${options.repoFullName}\`\n\n${options.errorMessage}`;
}

export function buildWorkflowQueuedMessage(workflowCount: number): string {
  return `Queued ${workflowCount} workflow${workflowCount === 1 ? "" : "s"} for this request.`;
}
