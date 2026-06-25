import type { ConversationSummary, ProjectSummary } from "../../../preload/api";
import {
  countConversations,
  deleteConversation,
  deleteConversationsForProject,
  deleteProject,
  getAllProjects,
  getConversationById,
  getConversationBySessionFile,
  getConversationsForProject,
  getWorkConversations,
  getWorkProjectConversations,
  getWorkSidebarProjects,
  putConversation as putConversationRow,
  putProject,
  type ConversationContext,
  type StoredConversation,
  type StoredProject,
} from "./chat-db";
import { isWorkWorkspaceCwd } from "./work-workspace";

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
    source: row.source,
  };
}

function projectName(cwd: string): string {
  return cwd.split(/[/\\]/).filter(Boolean).pop() ?? cwd;
}

/** Matches git worktrees under Application Support/.../workflow-worktrees (not user projects). */
export function isWorkflowWorktreeCwd(cwd: string): boolean {
  return /[/\\]workflow-worktrees[/\\]/.test(cwd);
}

export async function rememberProject(cwd: string, lastActivityAt?: string | null): Promise<void> {
  if (isWorkflowWorktreeCwd(cwd) || isWorkWorkspaceCwd(cwd)) return;
  const existing = (await getAllProjects()).find((p) => p.cwd === cwd);
  if (existing?.sidebarMode === "work") return;
  const at = lastActivityAt ?? existing?.lastActivityAt ?? new Date().toISOString();
  await putProject({
    cwd,
    name: projectName(cwd),
    lastActivityAt: at,
    sidebarMode: "coding",
  });
}

export async function rememberWorkProject(
  cwd: string,
  lastActivityAt?: string | null,
): Promise<void> {
  if (isWorkflowWorktreeCwd(cwd) || isWorkWorkspaceCwd(cwd)) return;
  const existing = (await getAllProjects()).find((p) => p.cwd === cwd);
  const at = lastActivityAt ?? existing?.lastActivityAt ?? new Date().toISOString();
  const row: StoredProject = {
    cwd,
    name: projectName(cwd),
    lastActivityAt: at,
    sidebarMode: "work",
  };
  await putProject(row);
}

export async function listProjectsFromStorage(): Promise<ProjectSummary[]> {
  const projects = await getAllProjects();
  const conversations = await Promise.all(
    projects
      .filter((p) => p.sidebarMode !== "work")
      .map(async (p) => ({
        cwd: p.cwd,
        count: (await getConversationsForProject(p.cwd)).length,
        lastActivityAt: p.lastActivityAt,
      })),
  );

  return conversations
    .filter((row) => !isWorkflowWorktreeCwd(row.cwd) && !isWorkWorkspaceCwd(row.cwd))
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

export async function listWorkProjectsFromStorage(): Promise<ProjectSummary[]> {
  const projects = await getWorkSidebarProjects();
  const conversations = await Promise.all(
    projects.map(async (p) => ({
      cwd: p.cwd,
      count: (await getWorkProjectConversations(p.cwd)).length,
      lastActivityAt: p.lastActivityAt,
    })),
  );

  return conversations
    .filter((row) => !isWorkflowWorktreeCwd(row.cwd) && !isWorkWorkspaceCwd(row.cwd))
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

export async function listConversationsFromStorage(
  cwd: string,
  scope: "coding" | "work-project" = "coding",
): Promise<ConversationSummary[]> {
  const rows =
    scope === "work-project"
      ? await getWorkProjectConversations(cwd)
      : await getConversationsForProject(cwd);
  return rows
    .map(toConversationSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function listWorkConversationsFromStorage(): Promise<ConversationSummary[]> {
  const rows = await getWorkConversations();
  return rows
    .map(toConversationSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function removeConversationFromStorage(sessionId: string): Promise<void> {
  await deleteConversation(sessionId);
}

export async function archiveAllConversationsForProject(projectCwd: string): Promise<string[]> {
  return deleteConversationsForProject(projectCwd);
}

export async function removeProjectFromStorage(cwd: string): Promise<void> {
  await deleteProject(cwd);
  await window.harness.removeProject({ cwd });
}

export { updateConversationTitle } from "./chat-db";
export { getWorkWorkspacePath, isWorkWorkspaceCwd } from "./work-workspace";

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
  source?: "github-workflow";
  context?: ConversationContext;
  /** When false, keeps the existing updatedAt (e.g. opening an older chat). Default: true */
  touchUpdatedAt?: boolean;
};

export async function persistConversation(input: PersistConversationInput): Promise<string> {
  const now = new Date().toISOString();
  const messages = input.messages ?? [];

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

  const isWorkflowConversation =
    input.source === "github-workflow" || existing?.source === "github-workflow";
  const title = isWorkflowConversation
    ? (input.title ?? existing?.title ?? "Workflow")
    : (input.title ?? deriveTitleFromMessages(messages));

  // Keep the stable local id (clientId / existing row). Pi sessionId can differ on first prompt.
  const id = existing?.id ?? input.clientId ?? input.sessionId ?? crypto.randomUUID();
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
    source: input.source ?? existing?.source,
    context: input.context ?? existing?.context,
  };

  await putConversationRow(row);
  if (row.context === "work") {
    // Hidden workspace chats are not sidebar projects.
  } else if (row.context === "work-project") {
    await rememberWorkProject(input.projectCwd, touchUpdatedAt ? now : undefined);
  } else {
    await rememberProject(input.projectCwd, touchUpdatedAt ? now : undefined);
  }

  return id;
}

let migrationPromise: Promise<void> | null = null;

async function importSessionSummaries(
  listProjects: () => Promise<
    Awaited<ReturnType<typeof window.harness.listProjects>>
  >,
  listConversations: (cwd: string) => Promise<
    Awaited<ReturnType<typeof window.harness.listConversations>>
  >,
): Promise<{ projects: number; conversations: number }> {
  const projects = await listProjects();
  let conversations = 0;
  for (const project of projects) {
    await rememberProject(project.cwd, project.lastActivityAt);
    const rows = await listConversations(project.cwd);
    for (const conversation of rows) {
      await putConversationRow({
        id: conversation.sessionId,
        projectCwd: project.cwd,
        sessionFile: conversation.sessionFile,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: [],
      });
      conversations += 1;
    }
  }
  return { projects: projects.length, conversations };
}

/** Import Pi session summaries when the local store is empty and global Pi config is enabled. */
export async function migrateFromPiSessionsIfEmpty(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    if ((await countConversations()) > 0) return;
    const settings = await window.harness.getSettings();
    if (!settings.useGlobalPiConfig) return;

    await importSessionSummaries(
      () => window.harness.listProjects(),
      (cwd) => window.harness.listConversations({ cwd }),
    );
  })();

  return migrationPromise;
}

/** Import session summaries from global `~/.pi` (manual action in settings). */
export async function importSessionsFromGlobalPi(): Promise<{
  projects: number;
  conversations: number;
}> {
  return importSessionSummaries(
    () => window.harness.listProjectsFromGlobalPi(),
    (cwd) => window.harness.listConversationsFromGlobalPi({ cwd }),
  );
}
