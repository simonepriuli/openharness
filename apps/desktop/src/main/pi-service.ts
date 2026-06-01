import {
  PiRpcClient,
  type PiEvent,
  type PiResponse,
  type PiState,
  type SessionStats,
} from "@openharness/pi-rpc";
import type { BrowserWindow } from "electron";
import { HarnessError } from "../shared/harness-errors.js";
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

interface SessionRuntime {
  client: PiRpcClient;
  cwd: string;
  sessionFile?: string;
  conversationId: string;
  sessionKey: string;
  isStreaming: boolean;
  lastAccessedAt: number;
  opChain: Promise<unknown>;
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
    const next = runtime.opChain.then(fn, fn);
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
    const e = event as { type?: string };
    const runtime = this.sessions.get(sessionKey);
    if (runtime) {
      if (e.type === "agent_start") runtime.isStreaming = true;
      if (e.type === "agent_end" || e.type === "harness_exit") runtime.isStreaming = false;
      if (e.type === "message_update") {
        const update = event as { assistantMessageEvent?: { type?: string } };
        if (update.assistantMessageEvent?.type === "error") {
          runtime.isStreaming = false;
        }
      }
    }
    this.window?.webContents.send("harness:event", { sessionKey, event });
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
  ): Promise<PiResponse> {
    const runtime = this.getRuntime(sessionKey);
    this.activeSessionKey = sessionKey;
    return runtime.client.send({
      type: "prompt",
      message,
      ...(streamingBehavior ? { streamingBehavior } : {}),
    });
  }

  async abort(sessionKey: string): Promise<PiResponse> {
    const runtime = this.getRuntime(sessionKey);
    return runtime.client.send({ type: "abort" });
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

  async getAvailableModels(sessionKey: string): Promise<HarnessModelInfo[]> {
    const runtime = this.tryGetRuntime(sessionKey);
    if (!runtime) return [];
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
}

export interface HarnessModelInfo {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
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
  return { provider, id, name, contextWindow, reasoning };
}

export const piSessionManager = new PiSessionManager();
