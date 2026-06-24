/** Prepended to user prompts that should reach the agent but stay hidden in the chat UI. */
export const SILENT_USER_MARKER = "<!-- openharness:silent-user -->\n";

export function wrapSilentUserMessage(text: string): string {
  return `${SILENT_USER_MARKER}${text}`;
}

export function isSilentUserMessage(text: string): boolean {
  return text.startsWith(SILENT_USER_MARKER);
}
