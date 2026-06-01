import type { ConversationSummary } from "../../../preload/api";

export function isStreamingConversation(
  conversation: ConversationSummary,
  streamingConversationIds: ReadonlySet<string>,
): boolean {
  return streamingConversationIds.has(conversation.sessionId);
}
