import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ProjectSummary {
  cwd: string;
  name: string;
  conversationCount: number;
  lastActivityAt: string | null;
}

export interface ConversationSummary {
  sessionId: string;
  sessionFile: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const TITLE_MAX_LEN = 72;

export function getPiSessionsRoot(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions");
}

export function encodeCwdForSessionsDir(cwd: string): string {
  const normalized = path.resolve(cwd);
  const slug = normalized.replace(/^\//, "").replace(/\//g, "-");
  return `--${slug}--`;
}

function readFirstLines(filePath: string, maxLines: number): string[] {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, bytes).toString("utf8");
    return text.split("\n").slice(0, maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

function parseJsonLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
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

function truncateTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX_LEN) return oneLine;
  return `${oneLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function summarizeSessionFile(sessionFile: string): ConversationSummary | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(sessionFile);
  } catch {
    return null;
  }

  const lines = readFirstLines(sessionFile, 40);
  if (lines.length === 0) return null;

  const header = parseJsonLine<{
    type?: string;
    id?: string;
    timestamp?: string;
    cwd?: string;
    name?: string;
  }>(lines[0]!);
  if (header?.type !== "session" || !header.id) return null;

  let title = typeof header.name === "string" ? header.name.trim() : "";
  const createdAt = header.timestamp ?? stat.mtime.toISOString();

  if (!title) {
    for (const line of lines.slice(1)) {
      const row = parseJsonLine<{
        type?: string;
        message?: { role?: string; content?: unknown };
      }>(line);
      if (row?.type !== "message" || row.message?.role !== "user") continue;
      const text = extractTextFromContent(row.message.content);
      if (text) {
        title = truncateTitle(text);
        break;
      }
    }
  }

  if (!title) {
    title = "New conversation";
  }

  return {
    sessionId: header.id,
    sessionFile,
    title,
    createdAt,
    updatedAt: stat.mtime.toISOString(),
  };
}

export function listConversationsForCwd(cwd: string): ConversationSummary[] {
  const dir = path.join(getPiSessionsRoot(), encodeCwdForSessionsDir(cwd));
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }

  const conversations: ConversationSummary[] = [];
  for (const file of entries) {
    const summary = summarizeSessionFile(path.join(dir, file));
    if (summary) conversations.push(summary);
  }

  conversations.sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return tb - ta;
  });

  return conversations;
}

export function listProjectsFromSessions(): ProjectSummary[] {
  const root = getPiSessionsRoot();
  let dirs: string[];
  try {
    dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const byCwd = new Map<string, ProjectSummary>();

  for (const dirName of dirs) {
    const dirPath = path.join(root, dirName);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    const firstSummary = summarizeSessionFile(path.join(dirPath, files[0]!));
    const headerLine = readFirstLines(path.join(dirPath, files[0]!), 1)[0];
    const header = headerLine ? parseJsonLine<{ cwd?: string }>(headerLine) : null;
    const cwd = header?.cwd;
    if (!cwd) continue;

    let lastActivityAt: string | null = firstSummary?.updatedAt ?? null;
    for (const file of files) {
      const summary = summarizeSessionFile(path.join(dirPath, file));
      if (!summary) continue;
      if (!lastActivityAt || summary.updatedAt > lastActivityAt) {
        lastActivityAt = summary.updatedAt;
      }
    }

    const name = path.basename(cwd);
    const existing = byCwd.get(cwd);
    if (existing) {
      existing.conversationCount += files.length;
      if (
        lastActivityAt &&
        (!existing.lastActivityAt || lastActivityAt > existing.lastActivityAt)
      ) {
        existing.lastActivityAt = lastActivityAt;
      }
    } else {
      byCwd.set(cwd, {
        cwd,
        name,
        conversationCount: files.length,
        lastActivityAt,
      });
    }
  }

  return [...byCwd.values()].sort((a, b) => {
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });
}
