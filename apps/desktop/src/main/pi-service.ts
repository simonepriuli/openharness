import {
  PiRpcClient,
  type PiEvent,
  type PiResponse,
  type PiState,
  type SessionStats,
} from "@openharness/pi-rpc";
import type { BrowserWindow } from "electron";
import { resolvePiBin } from "./pi-bin.js";

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

  private getRuntime(sessionKey: string): SessionRuntime {
    const runtime = this.sessions.get(sessionKey);
    if (!runtime) {
      throw new Error(`No Pi session for key: ${sessionKey}`);
    }
    this.touch(runtime);
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
    await client.start({
      command: resolvePiBin(),
      args,
      cwd,
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
    const runtime = this.getRuntime(sessionKey);
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
    const runtime = this.getRuntime(sessionKey);
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
    const runtime = this.getRuntime(sessionKey);
    return this.getMessagesFromClient(runtime.client);
  }
}

export const piSessionManager = new PiSessionManager();
