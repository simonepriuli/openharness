export interface AssistantTurnActions {
  content: string;
  entryId?: string;
  key: string;
}

export function collectAssistantTurnActions(
  turnAssistants: Array<{ id: string; content: string; entryId?: string }>,
): AssistantTurnActions | null {
  const parts: string[] = [];
  let entryId: string | undefined;
  for (const item of turnAssistants) {
    const text = item.content.trim();
    if (text) parts.push(text);
    if (item.entryId) entryId = item.entryId;
  }
  if (parts.length === 0) return null;
  const last = turnAssistants[turnAssistants.length - 1];
  return {
    content: parts.join("\n\n"),
    entryId,
    key: `turn-actions-${last?.id ?? "end"}`,
  };
}
