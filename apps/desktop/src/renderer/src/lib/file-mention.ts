export type MessagePart =
  | { type: "text"; value: string }
  | { type: "mention"; relativePath: string };

const MESSAGE_MENTION_PATTERN = /@"([^"]+)"|@([^\s@]+)/g;

/** Split user message text into plain text and @file mention tokens. */
export function parseMessageParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MESSAGE_MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, index) });
    }
    const relativePath = match[1] ?? match[2] ?? "";
    if (relativePath) {
      parts.push({ type: "mention", relativePath });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: content }];
}

export function formatFileMention(relativePath: string): string {
  if (/[\s"'`]/.test(relativePath) || relativePath.startsWith("/")) {
    return `@"${relativePath}"`;
  }
  return `@${relativePath}`;
}

export interface MentionRange {
  query: string;
  start: number;
  end: number;
}

/** Active @-mention at the cursor, if any. */
export function getMentionAtCursor(value: string, cursor: number): MentionRange | null {
  const before = value.slice(0, cursor);
  const match = before.match(/@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = cursor - match[0].length;
  return { query, start, end: cursor };
}

export function insertFileMention(
  value: string,
  mention: MentionRange,
  relativePath: string,
): { nextValue: string; cursor: number } {
  const token = formatFileMention(relativePath);
  const nextValue = value.slice(0, mention.start) + token + " " + value.slice(mention.end);
  const cursor = mention.start + token.length + 1;
  return { nextValue, cursor };
}
