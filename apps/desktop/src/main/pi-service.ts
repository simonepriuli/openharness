import {
  PiRpcClient,
  type PiEvent,
  type PiResponse,
  type PiState,
  type SessionStats,
} from "@openharness/pi-rpc";
import type { BrowserWindow } from "electron";
import { HarnessError } from "../shared/harness-errors.js";
import { DEFAULT_TITLE_MODEL_REF, parseModelRef } from "../shared/model-ref.js";

export { parseModelRef } from "../shared/model-ref.js";
import { enrichToolExecutionEnd } from "./enrich-tool-event.js";
import { resolvePiSpawn } from "./pi-bin.js";

const READY_POLL_MS = 75;
const READY_TIMEOUT_MS = 15_000;
const MAX_SESSIONS = 5;

export type EnsureSessionOptions = {
  cwd: string;
  sessionFile?: string;
  conversationId: string;
};

export type EnsureSessionResult = {
  sessionKey: string;
  messages: unknown[] | null;
};

export function buildSessionKey(
  cwd: string,
  opts: { sessionFile?: string; conversationId: string },
): string {
  if (opts.sessionFile) {
    return `${cwd}::file::${opts.sessionFile}`;
  }
  return `${cwd}::draft::${opts.conversationId}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface SessionRuntime {
  client: PiRpcClient;
  cwd: string;
  sessionFile?: string;
  conversationId: string;
  sessionKey: string;
  isStreaming: boolean;
  lastAccessedAt: number;
  opChain: Promise<unknown>;
  pendingToolArgs: Map<string, { args: unknown; toolName: string }>;
}

export class PiSessionManager {
  private sessions = new Map<string, SessionRuntime>();
  private window: BrowserWindow | null = null;
  private activeSessionKey: string | undefined;

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  setActiveSessionKey(sessionKey: string | undefined): void {
    this.activeSessionKey = sessionKey;
  }

  get currentCwd(): string | undefined {
    if (this.activeSessionKey) {
      return this.sessions.get(this.activeSessionKey)?.cwd;
    }
    const first = this.sessions.values().next().value;
    return first?.cwd;
  }

  get isRunning(): boolean {
    return this.sessions.size > 0;
  }

  private touch(runtime: SessionRuntime): void {
    runtime.lastAccessedAt = Date.now();
  }

  private tryGetRuntime(sessionKey: string): SessionRuntime | undefined {
    const runtime = this.sessions.get(sessionKey);
    if (runtime) {
      this.touch(runtime);
      return runtime;
    }
    return this.findRuntimeBySessionIdentity(sessionKey);
  }

  /** Resolve a session after rekey (draft key → file key) or stale renderer keys. */
  private findRuntimeBySessionIdentity(sessionKey: string): SessionRuntime | undefined {
    const draftMarker = "::draft::";
    const draftIndex = sessionKey.indexOf(draftMarker);
    if (draftIndex !== -1) {
      const cwd = sessionKey.slice(0, draftIndex);
      const conversationId = sessionKey.slice(draftIndex + draftMarker.length);
      for (const runtime of this.sessions.values()) {
        if (runtime.cwd === cwd && runtime.conversationId === conversationId) {
          this.touch(runtime);
          return runtime;
        }
      }
    }

    const fileMarker = "::file::";
    const fileIndex = sessionKey.indexOf(fileMarker);
    if (fileIndex !== -1) {
      const cwd = sessionKey.slice(0, fileIndex);
      const sessionFile = sessionKey.slice(fileIndex + fileMarker.length);
      for (const runtime of this.sessions.values()) {
        if (runtime.cwd === cwd && runtime.sessionFile === sessionFile) {
          this.touch(runtime);
          return runtime;
        }
      }
    }

    return undefined;
  }

  private getRuntime(sessionKey: string): SessionRuntime {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) {
      throw new HarnessError(
        "The agent session is not available. Try sending your message again.",
        "no_session",
      );
    }
    return runtime;
  }

  private enqueue<T>(runtime: SessionRuntime, fn: () => Promise<T>): Promise<T> {
    const next = runtime.opChain.then(fn);
    runtime.opChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async waitUntilReady(client: PiRpcClient): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!client.isRunning) {
        throw new Error("Pi process exited before the RPC session was ready");
      }
      try {
        const response = await client.send({ type: "get_state" });
        if (response.success) return;
      } catch (err) {
        if (!client.isRunning) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
      await delay(READY_POLL_MS);
    }
    throw new Error("Timed out waiting for Pi RPC to become ready");
  }

  private forwardEvent(sessionKey: string, event: PiEvent): void {
    void this.forwardEventAsync(sessionKey, event);
  }

  private async forwardEventAsync(sessionKey: string, event: PiEvent): Promise<void> {
    const e = event as {
      type?: string;
      toolCallId?: string;
      toolName?: string;
      args?: unknown;
    };
    const runtime = this.tryGetRuntime(sessionKey);
    const outboundKey = runtime?.sessionKey ?? sessionKey;
    let outbound: PiEvent = event;

    if (runtime) {
      if (e.type === "agent_start") runtime.isStreaming = true;
      if (e.type === "agent_end" || e.type === "harness_exit") runtime.isStreaming = false;
      if (e.type === "message_update") {
        const update = event as { assistantMessageEvent?: { type?: string } };
        if (update.assistantMessageEvent?.type === "error") {
          runtime.isStreaming = false;
        }
      }
      if (e.type === "tool_execution_start" && e.toolCallId) {
        runtime.pendingToolArgs.set(e.toolCallId, {
          args: e.args,
          toolName: e.toolName ?? "",
        });
      }
      if (e.type === "tool_execution_end") {
        const pending = e.toolCallId ? runtime.pendingToolArgs.get(e.toolCallId) : undefined;
        if (e.toolCallId) runtime.pendingToolArgs.delete(e.toolCallId);
        const withArgs = {
          ...(event as Record<string, unknown>),
          args: e.args ?? pending?.args,
          toolName: e.toolName ?? pending?.toolName,
        };
        outbound = await enrichToolExecutionEnd(runtime.cwd, withArgs as Parameters<
          typeof enrichToolExecutionEnd
        >[1]);
      }
    }

    this.window?.webContents.send("harness:event", { sessionKey: outboundKey, event: outbound });
  }

  private bindClientEvents(sessionKey: string, client: PiRpcClient, runtime: SessionRuntime): void {
    client.removeAllListeners();
    client.on("event", (event) => this.forwardEvent(sessionKey, event));
    client.on("stderr", (chunk) => {
      console.error(`[pi stderr ${sessionKey}]`, chunk);
    });
    client.on("exit", (code, signal) => {
      runtime.isStreaming = false;
      runtime.sessionFile = undefined;
      this.forwardEvent(sessionKey, {
        type: "harness_exit",
        code,
        signal,
      } as PiEvent);
      void this.removeSession(sessionKey);
    });
  }

  private async getMessagesFromClient(client: PiRpcClient): Promise<unknown[] | null> {
    if (!client.isRunning) {
      throw new Error("Pi RPC process is not running");
    }
    const response = await client.send({ type: "get_messages" });
    if (!response.success) {
      throw new Error(response.error ?? "Failed to load conversation messages");
    }
    const data = response.data as { messages?: unknown[] } | undefined;
    return data?.messages ?? null;
  }

  private async spawnSession(
    cwd: string,
    sessionFile: string | undefined,
  ): Promise<PiRpcClient> {
    const client = new PiRpcClient();
    const args = ["--mode", "rpc"];
    if (sessionFile) {
      args.push("--session", sessionFile);
    }
    const spawn = resolvePiSpawn(args);
    await client.start({
      command: spawn.command,
      args: spawn.args,
      cwd,
      env: spawn.env,
    });
    await this.waitUntilReady(client);
    return client;
  }

  private async getAvailableModelsFromDetachedPi(): Promise<HarnessModelInfo[]> {
    const client = new PiRpcClient();
    const spawn = resolvePiSpawn(["--mode", "rpc", "--no-session"]);
    try {
      await client.start({
        command: spawn.command,
        args: spawn.args,
        cwd: this.currentCwd ?? process.cwd(),
        env: spawn.env,
      });
      await this.waitUntilReady(client);
      const response = await client.send({ type: "get_available_models" });
      if (!response.success) return [];
      const data = response.data as { models?: unknown[] } | undefined;
      const models = data?.models ?? [];
      return models.map(normalizeModelInfo).filter((m): m is HarnessModelInfo => m !== null);
    } catch {
      return [];
    } finally {
      await client.stop().catch(() => {});
    }
  }

  private async evictIdleSessions(): Promise<void> {
    if (this.sessions.size < MAX_SESSIONS) return;

    const candidates = [...this.sessions.entries()]
      .filter(([key, runtime]) => !runtime.isStreaming && key !== this.activeSessionKey)
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [key] of candidates) {
      if (this.sessions.size < MAX_SESSIONS) break;
      await this.removeSession(key);
    }
  }

  private async removeSession(sessionKey: string): Promise<void> {
    const runtime = this.sessions.get(sessionKey);
    if (!runtime) return;
    this.sessions.delete(sessionKey);
    if (this.activeSessionKey === sessionKey) {
      this.activeSessionKey = undefined;
    }
    await runtime.client.stop();
  }

  rekeySession(oldKey: string, newKey: string, sessionFile: string): void {
    if (oldKey === newKey) return;
    const runtime = this.sessions.get(oldKey);
    if (!runtime) return;
    if (this.sessions.has(newKey)) {
      void this.removeSession(oldKey);
      return;
    }
    this.sessions.delete(oldKey);
    runtime.sessionKey = newKey;
    runtime.sessionFile = sessionFile;
    this.sessions.set(newKey, runtime);
    if (this.activeSessionKey === oldKey) {
      this.activeSessionKey = newKey;
    }
  }

  async ensureSession(options: EnsureSessionOptions): Promise<EnsureSessionResult> {
    const sessionKey = buildSessionKey(options.cwd, {
      sessionFile: options.sessionFile,
      conversationId: options.conversationId,
    });

    const existing = this.sessions.get(sessionKey);
    if (existing?.client.isRunning) {
      this.touch(existing);
      this.activeSessionKey = sessionKey;
      const messages = options.sessionFile
        ? await this.getMessages(sessionKey)
        : null;
      return { sessionKey, messages };
    }

    await this.evictIdleSessions();

    if (this.sessions.size >= MAX_SESSIONS) {
      const allStreaming = [...this.sessions.values()].every((r) => r.isStreaming);
      if (allStreaming) {
        throw new Error(
          `Too many active agent sessions (max ${MAX_SESSIONS}). Wait for one to finish.`,
        );
      }
      await this.evictIdleSessions();
    }

    const client = await this.spawnSession(options.cwd, options.sessionFile);
    const runtime: SessionRuntime = {
      client,
      cwd: options.cwd,
      sessionFile: options.sessionFile,
      conversationId: options.conversationId,
      sessionKey,
      isStreaming: false,
      lastAccessedAt: Date.now(),
      opChain: Promise.resolve(),
      pendingToolArgs: new Map(),
    };
    this.bindClientEvents(sessionKey, client, runtime);
    this.sessions.set(sessionKey, runtime);
    this.activeSessionKey = sessionKey;

    const messages =
      options.sessionFile && client.isRunning
        ? await this.getMessagesFromClient(client)
        : null;

    return { sessionKey, messages };
  }

  async stopAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    await Promise.all(keys.map((key) => this.removeSession(key)));
  }

  /** Stop all Pi subprocesses so the next session picks up new config/auth. */
  async restartAll(): Promise<void> {
    await this.stopAll();
  }

  async prompt(
    sessionKey: string,
    message: string,
    streamingBehavior?: "steer" | "followUp",
    images?: { type: "image"; data: string; mimeType: string }[],
  ): Promise<PiResponse> {
    const runtime = this.getRuntime(sessionKey);
    this.activeSessionKey = sessionKey;
    return this.enqueue(runtime, () =>
      withTimeout(
        runtime.client.send({
          type: "prompt",
          message,
          ...(images?.length ? { images } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
        }),
        12_000,
        "Timed out waiting for prompt preflight acknowledgment",
      ),
    );
  }

  async abort(sessionKey: string): Promise<PiResponse> {
    const runtime = this.getRuntime(sessionKey);
    return runtime.client.send({ type: "abort" });
  }

  respondExtensionUi(
    sessionKey: string,
    response: { id: string; value?: string; confirmed?: boolean; cancelled?: true },
  ): void {
    const runtime = this.getRuntime(sessionKey);
    const payload: Record<string, unknown> = {
      type: "extension_ui_response",
      id: response.id,
    };
    if (response.cancelled === true) {
      payload.cancelled = true;
    } else if (typeof response.value === "string") {
      payload.value = response.value;
    } else if (typeof response.confirmed === "boolean") {
      payload.confirmed = response.confirmed;
    } else {
      payload.cancelled = true;
    }
    runtime.client.notify(payload);
  }

  async getState(sessionKey: string): Promise<PiState | null> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) return null;
    const response = await runtime.client.send({ type: "get_state" });
    if (!response.success) return null;
    const state = response.data as PiState;
    if (state.sessionFile && !runtime.sessionFile) {
      const newKey = buildSessionKey(runtime.cwd, {
        sessionFile: state.sessionFile,
        conversationId: runtime.conversationId,
      });
      this.rekeySession(sessionKey, newKey, state.sessionFile);
    }
    return state;
  }

  async getSessionStats(sessionKey: string): Promise<SessionStats | null> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) return null;
    const response = await runtime.client.send({ type: "get_session_stats" });
    if (!response.success) return null;
    return response.data as SessionStats;
  }

  async newSession(sessionKey: string): Promise<PiResponse> {
    const runtime = this.getRuntime(sessionKey);
    return this.enqueue(runtime, async () => {
      const response = await runtime.client.send({ type: "new_session" });
      if (!response.success) {
        throw new Error(response.error ?? "Failed to start a new session");
      }
      const data = response.data as { cancelled?: boolean } | undefined;
      if (data?.cancelled) {
        throw new Error("New session was cancelled");
      }
      runtime.sessionFile = undefined;
      return { type: "response", command: "new_session", success: true };
    });
  }

  async getMessages(sessionKey: string): Promise<unknown[] | null> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) return null;
    return this.getMessagesFromClient(runtime.client);
  }

  async getAvailableModels(sessionKey?: string | null): Promise<HarnessModelInfo[]> {
    const runtimeFromKey =
      typeof sessionKey === "string" && sessionKey.trim().length > 0
        ? this.tryGetRuntime(sessionKey)
        : undefined;
    const runtimeFromActive = this.activeSessionKey
      ? this.tryGetRuntime(this.activeSessionKey)
      : undefined;
    const runtime = runtimeFromKey ?? runtimeFromActive ?? this.sessions.values().next().value;
    if (!runtime) {
      return this.getAvailableModelsFromDetachedPi();
    }
    return this.enqueue(runtime, async () => {
      const response = await runtime.client.send({ type: "get_available_models" });
      if (!response.success) return [];
      const data = response.data as { models?: unknown[] } | undefined;
      const models = data?.models ?? [];
      return models.map(normalizeModelInfo).filter((m): m is HarnessModelInfo => m !== null);
    });
  }

  async setModel(
    sessionKey: string,
    provider: string,
    modelId: string,
  ): Promise<PiResponse> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) {
      throw new HarnessError(
        "The agent session is not available. Try sending your message again.",
        "no_session",
      );
    }
    return this.enqueue(runtime, () =>
      runtime.client.send({ type: "set_model", provider, modelId }),
    );
  }

  async setThinkingLevel(sessionKey: string, level: string): Promise<PiResponse> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) {
      throw new HarnessError(
        "The agent session is not available. Try sending your message again.",
        "no_session",
      );
    }
    return this.enqueue(runtime, () =>
      runtime.client.send({ type: "set_thinking_level", level }),
    );
  }

  async setSwarmMode(sessionKey: string, enabled: boolean): Promise<PiResponse> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) {
      throw new HarnessError(
        "The agent session is not available. Try sending your message again.",
        "no_session",
      );
    }
    return this.enqueue(runtime, async () => {
      try {
        return await runtime.client.send({ type: "set_swarm_mode", enabled });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const shouldRetryLegacy =
          message.includes("set_swarm_mode") ||
          message.includes("Unknown command: set_swarm_mode");
        if (!shouldRetryLegacy) throw err;
        return runtime.client.send({ type: "set_swarn_mode", enabled });
      }
    });
  }

  async generateTitle(message: string, modelRef: string): Promise<string | null> {
    const parsed = parseModelRef(modelRef);
    if (!parsed) return null;

    const prompt = `Generate a short, concise title (maximum 6 words) for a chat conversation that starts with this user message. Return ONLY the title, no quotes, no additional text, no punctuation at the end.\n\nUser message: ${message}`;

    const client = new PiRpcClient();
    const spawn = resolvePiSpawn(["--mode", "rpc", "--no-session"]);
    try {
      await client.start({
        command: spawn.command,
        args: spawn.args,
        cwd: this.currentCwd ?? process.cwd(),
        env: spawn.env,
      });
      await this.waitUntilReady(client);

      const setModelResponse = await client.send({
        type: "set_model",
        provider: parsed.provider,
        modelId: parsed.modelId,
      });
      if (!setModelResponse.success) return null;

      const turnEnd = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.off("event", onEvent);
          reject(new Error("Title generation timed out"));
        }, 30_000);
        const onEvent = (event: { type?: string }) => {
          if (event.type === "turn_end") {
            clearTimeout(timeout);
            client.off("event", onEvent);
            resolve();
          }
        };
        client.on("event", onEvent);
      });

      const promptResponse = await client.send({ type: "prompt", message: prompt });
      if (!promptResponse.success) return null;

      await turnEnd;

      const textResponse = await client.send({ type: "get_last_assistant_text" });
      if (!textResponse.success) return null;
      const data = textResponse.data as { text?: string | null } | undefined;
      const raw = typeof data?.text === "string" ? data.text.trim() : "";
      if (!raw) return null;

      const cleanedTitle = raw
        .replace(/^["'«“]+|["'»”]+$/g, "")
        .replace(/[.!?:;,]+$/g, "")
        .trim();
      if (!cleanedTitle) return null;

      const limitedTitle = cleanedTitle.split(/\s+/).slice(0, 6).join(" ").trim();
      if (!limitedTitle) return null;

      return limitedTitle.length <= 100 ? limitedTitle : null;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("[pi-service:generateTitle]", errMessage);
      return null;
    } finally {
      await client.stop().catch(() => {});
    }
  }
}

export interface HarnessModelInfo {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<
    Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>
  >;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

function parseThinkingLevelMap(
  raw: unknown,
): HarnessModelInfo["thinkingLevelMap"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const map: NonNullable<HarnessModelInfo["thinkingLevelMap"]> = {};
  let hasEntry = false;
  for (const level of THINKING_LEVELS) {
    if (!(level in record)) continue;
    const value = record[level];
    if (value === null) {
      map[level] = null;
      hasEntry = true;
      continue;
    }
    if (typeof value === "string") {
      map[level] = value;
      hasEntry = true;
    }
  }
  return hasEntry ? map : undefined;
}

export function normalizeModelInfo(raw: unknown): HarnessModelInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider : "";
  const id = typeof record.id === "string" ? record.id : "";
  if (!provider || !id) return null;
  const name = typeof record.name === "string" ? record.name : undefined;
  const contextWindow =
    typeof record.contextWindow === "number" && record.contextWindow > 0
      ? record.contextWindow
      : undefined;
  const reasoning = typeof record.reasoning === "boolean" ? record.reasoning : undefined;
  const thinkingLevelMap = parseThinkingLevelMap(record.thinkingLevelMap);
  return { provider, id, name, contextWindow, reasoning, thinkingLevelMap };
}

export function normalizeTitleGenerationModelRef(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return DEFAULT_TITLE_MODEL_REF;
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return `openrouter/${trimmed}`;
  }
  return trimmed;
}

export const piSessionManager = new PiSessionManager();
