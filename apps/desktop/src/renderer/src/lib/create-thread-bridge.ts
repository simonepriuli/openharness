import {
  createConversationRuntime,
  type ConversationRuntime,
} from "./conversation-runtime";
import { deriveTitleFromMessages, persistConversation } from "./chat-storage";
import { buildSessionKey } from "./session-key";

export const OPENHARNESS_CREATE_THREAD_UI_TITLE = "__openharness:create_thread__";

export interface CreateThreadParams {
  title?: string;
  initial_prompt?: string;
  switch_to: boolean;
}

export interface CreateConversationResult {
  conversationId: string;
  sessionKey: string;
  title: string;
}

export interface CreateConversationError {
  error: string;
}

export interface ExtensionUiCreateThreadRequest {
  requestId: string;
  placeholder: string;
}

interface ExtensionUiInputRequestLike {
  type?: unknown;
  id?: unknown;
  method?: unknown;
  title?: unknown;
  placeholder?: unknown;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseExtensionUiCreateThreadRequest(
  event: unknown,
): ExtensionUiCreateThreadRequest | null {
  if (!event || typeof event !== "object") return null;
  const request = event as ExtensionUiInputRequestLike;
  if (request.type !== "extension_ui_request") return null;
  if (request.method !== "input") return null;
  if (request.title !== OPENHARNESS_CREATE_THREAD_UI_TITLE) return null;
  const requestId = asNonEmptyString(request.id);
  if (!requestId) return null;
  return {
    requestId,
    placeholder: typeof request.placeholder === "string" ? request.placeholder : "",
  };
}

export function parseCreateThreadParams(
  placeholder: string,
): CreateThreadParams | CreateConversationError {
  if (!placeholder.trim()) {
    return { error: "Missing create_thread parameters." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(placeholder);
  } catch {
    return { error: "Invalid create_thread parameter JSON." };
  }

  if (!raw || typeof raw !== "object") {
    return { error: "Invalid create_thread parameters." };
  }

  const record = raw as Record<string, unknown>;
  const title = asNonEmptyString(record.title) ?? undefined;
  const initial_prompt = asNonEmptyString(record.initial_prompt) ?? undefined;
  const switch_to = record.switch_to === true;

  return { title, initial_prompt, switch_to };
}

function resolveConversationTitle(title: string | undefined, initialPrompt: string | undefined): string {
  if (title) return title;
  if (initialPrompt) {
    return deriveTitleFromMessages([{ role: "user", content: initialPrompt }], "New conversation");
  }
  return "New conversation";
}

export async function createConversation(options: {
  projectCwd: string;
  title?: string;
  initialPrompt?: string;
  switchTo?: boolean;
  runtimesRef: { current: Map<string, ConversationRuntime> };
  attachRuntime: (conversationId: string) => void;
  bumpRuntimes: () => void;
  onExpandProject: (cwd: string) => void;
  onConversationRefresh: () => void;
  refreshProjects: (options?: { silent?: boolean }) => Promise<void>;
  isViewCurrent?: () => boolean;
}): Promise<CreateConversationResult | CreateConversationError> {
  const clientId = crypto.randomUUID();
  const resolvedTitle = resolveConversationTitle(options.title, options.initialPrompt);
  const sessionKey = buildSessionKey(options.projectCwd, { conversationId: clientId });

  const runtime = createConversationRuntime({
    conversationId: clientId,
    sessionKey,
    cwd: options.projectCwd,
    title: resolvedTitle,
    status: "connecting",
  });
  options.runtimesRef.current.set(clientId, runtime);
  if (options.switchTo !== false) {
    options.attachRuntime(clientId);
  }

  try {
    const { sessionKey: ensuredKey } = await window.harness.start({
      cwd: options.projectCwd,
      conversationId: clientId,
    });
    if (options.isViewCurrent && !options.isViewCurrent()) {
      return { error: "Conversation creation was superseded by a navigation change." };
    }

    runtime.sessionKey = ensuredKey;
    const response = await window.harness.newSession({ sessionKey: ensuredKey });
    if (!response.success) {
      throw new Error(response.error ?? "Could not start a new conversation");
    }
    if (options.isViewCurrent && !options.isViewCurrent()) {
      return { error: "Conversation creation was superseded by a navigation change." };
    }

    runtime.status = "connected";
    await persistConversation({
      projectCwd: options.projectCwd,
      clientId,
      messages: [],
      sessionFile: null,
      title: resolvedTitle,
    });
    options.onExpandProject(options.projectCwd);
    options.onConversationRefresh();
    void options.refreshProjects({ silent: true });
    options.bumpRuntimes();

    return {
      conversationId: clientId,
      sessionKey: ensuredKey,
      title: resolvedTitle,
    };
  } catch (err) {
    runtime.status = "error";
    runtime.error = err instanceof Error ? err.message : String(err);
    options.bumpRuntimes();
    return {
      error: runtime.error,
    };
  }
}
