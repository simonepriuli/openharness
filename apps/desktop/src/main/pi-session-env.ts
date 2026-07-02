import { getMarkdownLocksFileForSession } from "./markdown-edit-lock.js";

export type ConversationContext = "coding" | "work" | "work-project";

export function buildPiSessionSpawnEnv(
  spawnEnv: NodeJS.ProcessEnv,
  githubActionsEnv: NodeJS.ProcessEnv,
  conversationContext: ConversationContext | undefined,
  attachedRootsFile: string | undefined,
  sessionKey: string | undefined,
): NodeJS.ProcessEnv {
  const resolvedContext: ConversationContext = conversationContext ?? "coding";
  return {
    ...spawnEnv,
    ...githubActionsEnv,
    OPENHARNESS_CONVERSATION_CONTEXT: resolvedContext,
    ...(attachedRootsFile
      ? { OPENHARNESS_ATTACHED_ROOTS_FILE: attachedRootsFile }
      : {}),
    ...(sessionKey
      ? { OPENHARNESS_MARKDOWN_LOCKS_FILE: getMarkdownLocksFileForSession(sessionKey) }
      : {}),
  };
}
