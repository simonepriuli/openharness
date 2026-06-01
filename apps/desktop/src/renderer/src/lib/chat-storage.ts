import type { ConversationSummary, ProjectSummary } from "../../../preload/api";
import {
  countConversations,
  getAllProjects,
  getConversationById,
  getConversationBySessionFile,
  getConversationsForProject,
  putConversation as putConversationRow,
  putProject,
  type StoredConversation,
} from "./chat-db";

const TITLE_MAX_LEN = 72;

function truncateTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX_LEN) return oneLine;
  return `${oneLine.slice(0, TITLE_MAX_LEN - 1)}…`;
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

export function deriveTitleFromMessages(messages: unknown[] | null, fallback = "New conversation"): string {
  if (!messages?.length) return fallback;
  for (const raw of messages) {
    const msg = raw as { role?: string; content?: unknown };
    if (msg.role !== "user") continue;
    const text = extractTextFromContent(msg.content);
    if (text) return truncateTitle(text);
  }
  return fallback;
}

function toConversationSummary(row: StoredConversation): ConversationSummary {
  return {
    sessionId: row.id,
    sessionFile: row.sessionFile ?? "",
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function projectName(cwd: string): string {
  return cwd.split(/[/\\]/).filter(Boolean).pop() ?? cwd;
}

export async function rememberProject(cwd: string, lastActivityAt?: string | null): Promise<void> {
  const existing = (await getAllProjects()).find((p) => p.cwd === cwd);
  const at = lastActivityAt ?? existing?.lastActivityAt ?? new Date().toISOString();
  await putProject({
    cwd,
    name: projectName(cwd),
    lastActivityAt: at,
  });
}

export async function listProjectsFromStorage(): Promise<ProjectSummary[]> {
  const projects = await getAllProjects();
  const conversations = await Promise.all(
    projects.map(async (p) => ({
      cwd: p.cwd,
      count: (await getConversationsForProject(p.cwd)).length,
      lastActivityAt: p.lastActivityAt,
    })),
  );

  return conversations
    .map((row) => ({
      cwd: row.cwd,
      name: projectName(row.cwd),
      conversationCount: row.count,
      lastActivityAt: row.lastActivityAt,
    }))
    .sort((a, b) => {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return tb - ta;
    });
}

export async function listConversationsFromStorage(cwd: string): Promise<ConversationSummary[]> {
  const rows = await getConversationsForProject(cwd);
  return rows
    .map(toConversationSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getStoredMessages(
  sessionFile?: string | null,
  sessionId?: string | null,
): Promise<unknown[] | null> {
  if (sessionFile) {
    const byFile = await getConversationBySessionFile(sessionFile);
    if (byFile?.messages.length) return byFile.messages;
  }
  if (sessionId) {
    const byId = await getConversationById(sessionId);
    if (byId?.messages.length) return byId.messages;
  }
  return null;
}

export type PersistConversationInput = {
  projectCwd: string;
  sessionId?: string | null;
  sessionFile?: string | null;
  messages: unknown[] | null;
  title?: string;
  clientId?: string;
  /** When false, keeps the existing updatedAt (e.g. opening an older chat). Default: true */
  touchUpdatedAt?: boolean;
};

export async function persistConversation(input: PersistConversationInput): Promise<string> {
  const now = new Date().toISOString();
  const messages = input.messages ?? [];
  const title = input.title ?? deriveTitleFromMessages(messages);

  let existing: StoredConversation | null = null;
  if (input.sessionFile) {
    existing = await getConversationBySessionFile(input.sessionFile);
  }
  if (!existing && input.sessionId) {
    existing = await getConversationById(input.sessionId);
  }
  if (!existing && input.clientId) {
    existing = await getConversationById(input.clientId);
  }

  const id = input.sessionId ?? existing?.id ?? input.clientId ?? crypto.randomUUID();
  const createdAt = existing?.createdAt ?? now;
  const touchUpdatedAt =
    input.touchUpdatedAt === true
      ? true
      : input.touchUpdatedAt === false
        ? false
        : !existing || messages.length > existing.messages.length;
  const updatedAt = touchUpdatedAt ? now : (existing?.updatedAt ?? now);

  const row: StoredConversation = {
    id,
    projectCwd: input.projectCwd,
    sessionFile: input.sessionFile ?? existing?.sessionFile ?? null,
    title: title || existing?.title || "New conversation",
    createdAt,
    updatedAt,
    messages,
  };

  await putConversationRow(row);
  await rememberProject(input.projectCwd, touchUpdatedAt ? now : undefined);

  return id;
}

let migrationPromise: Promise<void> | null = null;

/** Import Pi session summaries into IndexedDB when the local store is empty. */
export async function migrateFromPiSessionsIfEmpty(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    if ((await countConversations()) > 0) return;

    const projects = await window.harness.listProjects();
    for (const project of projects) {
      await rememberProject(project.cwd, project.lastActivityAt);
      const conversations = await window.harness.listConversations({ cwd: project.cwd });
      for (const conversation of conversations) {
        await putConversationRow({
          id: conversation.sessionId,
          projectCwd: project.cwd,
          sessionFile: conversation.sessionFile,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messages: [],
        });
      }
    }
  })();

  return migrationPromise;
}
