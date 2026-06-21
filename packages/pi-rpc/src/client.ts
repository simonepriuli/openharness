import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { splitJsonlLines } from "./jsonl.js";
import type { PiCommand, PiEvent, PiResponse, PiRpcStartOptions, PiSlashCommand } from "./types.js";

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `req-${requestCounter}`;
}

export class PiRpcClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private pending = new Map<
    string,
    { resolve: (value: PiResponse) => void; reject: (reason: Error) => void }
  >();

  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  async start(options: PiRpcStartOptions = {}): Promise<void> {
    await this.stop();

    const command = options.command ?? "pi";
    const args = options.args ?? ["--mode", "rpc"];
    if (options.noSession && !args.includes("--no-session")) {
      args.push("--no-session");
    }

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process = child;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.handleStdout(chunk));

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
      this.emit("stderr", chunk);
    });

    child.on("error", (err) => this.emit("error", err));

    child.on("exit", (code, signal) => {
      const stderr = this.stderrBuffer.trim();
      const detail = stderr ? ` ${stderr.split("\n").slice(-4).join(" ")}` : "";
      this.rejectAllPending(
        new Error(`Pi process exited (code=${code}, signal=${signal}).${detail}`),
      );
      this.process = null;
      this.emit("exit", code, signal);
    });

    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        child.off("error", onError);
        resolve();
      };
      const onError = (err: Error) => {
        child.off("spawn", onSpawn);
        reject(err);
      };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const child = this.process;
    this.process = null;
    this.rejectAllPending(new Error("Pi process stopped"));

    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    });
  }

  async send(command: PiCommand): Promise<PiResponse> {
    if (!this.process?.stdin?.writable) {
      throw new Error("Pi RPC process is not running");
    }

    const id = command.id ?? nextRequestId();
    const payload = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pi RPC request timed out: ${command.type}`));
      }, 120_000);

      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process!.stdin!.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  notify(command: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      throw new Error("Pi RPC process is not running");
    }
    this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  async getCommands(): Promise<PiSlashCommand[]> {
    const response = await this.send({ type: "get_commands" });
    if (!response.success) {
      throw new Error(response.error ?? "Failed to load slash commands");
    }
    const data = response.data as { commands?: PiSlashCommand[] } | undefined;
    return data?.commands ?? [];
  }

  private rejectAllPending(error: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const { lines, remainder } = splitJsonlLines(this.stdoutBuffer);
    this.stdoutBuffer = remainder;

    for (const line of lines) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        console.error("[pi-rpc] Failed to parse JSONL line:", line.slice(0, 200));
        continue;
      }

      if (parsed.type === "response") {
        this.handleResponse(parsed as unknown as PiResponse);
      } else {
        this.emit("event", parsed as PiEvent);
      }
    }
  }

  private handleResponse(response: PiResponse): void {
    if (response.id) {
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        pending.resolve(response);
        return;
      }
    }
    // Unsolicited responses are rare; emit as event for debugging
    this.emit("event", response as unknown as PiEvent);
  }
}
