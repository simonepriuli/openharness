import {
  createInitialTimelineState,
  nextId,
  type TimelineItem,
  type TimelineState,
} from "../events";

interface RpcMessage {
  role?: string;
  content?: unknown;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

export function messagesToTimeline(messages: unknown[] | null): TimelineState {
  if (!messages?.length) return createInitialTimelineState();

  const items: TimelineItem[] = [];

  for (const raw of messages) {
    const msg = raw as RpcMessage;
    if (msg.role === "user") {
      const text = extractTextFromContent(msg.content);
      if (text) {
        items.push({ kind: "user", id: nextId("user"), content: text });
      }
      continue;
    }
    if (msg.role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text) {
        items.push({ kind: "assistant", id: nextId("assistant"), content: text });
      }
    }
  }

  return { items };
}
