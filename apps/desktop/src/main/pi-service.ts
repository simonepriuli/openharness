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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PiService {
  private client = new PiRpcClient();
  private window: BrowserWindow | null = null;
  private cwd: string | undefined;
  private opChain: Promise<unknown> = Promise.resolve();

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  get isRunning(): boolean {
    return this.client.isRunning;
  }

  get currentCwd(): string | undefined {
    return this.cwd;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(fn, fn);
    this.opChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.client.isRunning) {
        throw new Error("Pi process exited before the RPC session was ready");
      }
      try {
        const response = await this.client.send({ type: "get_state" });
        if (response.success) return;
      } catch (err) {
        if (!this.client.isRunning) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
      await delay(READY_POLL_MS);
    }
    throw new Error("Timed out waiting for Pi RPC to become ready");
  }

  private async stopInternal(): Promise<void> {
    await this.client.stop();
  }

  async start(cwd: string, sessionFile?: string): Promise<unknown[] | null> {
    return this.enqueue(async () => {
      await this.stopInternal();
      this.cwd = cwd;

      this.client.removeAllListeners();
      this.client.on("event", (event) => this.forwardEvent(event));
      this.client.on("stderr", (chunk) => {
        console.error("[pi stderr]", chunk);
      });
      this.client.on("exit", (code, signal) => {
        this.forwardEvent({
          type: "harness_exit",
          code,
          signal,
        } as PiEvent);
      });

      const args = ["--mode", "rpc"];
      if (sessionFile) {
        args.push("--session", sessionFile);
      }

      await this.client.start({
        command: resolvePiBin(),
        args,
        cwd,
      });

      await this.waitUntilReady();

      if (!sessionFile) return null;
      return this.getMessages();
    });
  }

  async stop(): Promise<void> {
    return this.enqueue(() => this.stopInternal());
  }

  async prompt(message: string, streamingBehavior?: "steer" | "followUp"): Promise<PiResponse> {
    return this.client.send({
      type: "prompt",
      message,
      ...(streamingBehavior ? { streamingBehavior } : {}),
    });
  }

  async abort(): Promise<PiResponse> {
    return this.client.send({ type: "abort" });
  }

  async getState(): Promise<PiState | null> {
    const response = await this.client.send({ type: "get_state" });
    if (!response.success) return null;
    return response.data as PiState;
  }

  async getSessionStats(): Promise<SessionStats | null> {
    const response = await this.client.send({ type: "get_session_stats" });
    if (!response.success) return null;
    return response.data as SessionStats;
  }

  async newSession(): Promise<PiResponse> {
    return this.client.send({ type: "new_session" });
  }

  async getMessages(): Promise<unknown[] | null> {
    if (!this.client.isRunning) {
      throw new Error("Pi RPC process is not running");
    }
    const response = await this.client.send({ type: "get_messages" });
    if (!response.success) {
      throw new Error(response.error ?? "Failed to load conversation messages");
    }
    const data = response.data as { messages?: unknown[] } | undefined;
    return data?.messages ?? null;
  }

  private forwardEvent(event: PiEvent): void {
    this.window?.webContents.send("harness:event", event);
  }
}

export const piService = new PiService();
