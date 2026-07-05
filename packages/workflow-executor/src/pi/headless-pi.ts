import { PiRpcClient, type PiEvent } from "@openharness/pi-rpc";
import type { HeadlessPiRunResult, PiSpawnConfig, WorkflowPiRunner } from "../deps.js";

const READY_POLL_MS = 75;
const READY_TIMEOUT_MS = 15_000;
export const AGENT_TIMEOUT_MS = 20 * 60_000;
export const PROMPTED_AGENT_TIMEOUT_MS = 5 * 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(client: PiRpcClient): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!client.isRunning) {
      throw new Error("Pi process exited before the RPC session was ready");
    }
    try {
      const response = await client.send({ type: "get_state" });
      if (response.success) return;
    } catch {
      if (!client.isRunning) throw new Error("Pi process exited");
    }
    await delay(READY_POLL_MS);
  }
  throw new Error("Timed out waiting for Pi RPC to become ready");
}

async function readPiSessionPath(client: PiRpcClient): Promise<string | null> {
  const response = await client.send({ type: "get_state" });
  if (!response.success) return null;
  const data = response.data as { sessionFile?: string } | undefined;
  return typeof data?.sessionFile === "string" ? data.sessionFile : null;
}

function autoRespondExtensionUi(client: PiRpcClient): () => void {
  const listener = (event: PiEvent) => {
    const e = event as { type?: string; id?: string; method?: string; options?: string[] };
    if (e.type !== "extension_ui_request" || !e.id) return;

    if (e.method === "confirm") {
      client.notify({ type: "extension_ui_response", id: e.id, confirmed: true });
      return;
    }

    if (e.method === "select" && e.options?.length) {
      client.notify({ type: "extension_ui_response", id: e.id, value: e.options[0]! });
      return;
    }

    client.notify({ type: "extension_ui_response", id: e.id, cancelled: true });
  };

  client.on("event", listener);
  return () => client.off("event", listener);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as { type?: string; text?: string };
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("\n");
}

export function extractAssistantText(messages: unknown[]): string {
  const parts: string[] = [];
  for (const raw of messages) {
    const msg = raw as { role?: string; content?: unknown };
    if (msg.role === "assistant") {
      parts.push(extractText(msg.content));
    }
  }
  return parts.join("\n\n");
}

export async function runHeadlessPiPrompt(options: {
  spawn: PiSpawnConfig;
  cwd: string;
  prompt: string;
  model?: { provider: string; modelId: string } | null;
  env?: NodeJS.ProcessEnv;
  onEvent?: (event: PiEvent) => void;
  onAuthFileReleased?: (env: NodeJS.ProcessEnv) => void;
  sessionMode?: "new" | "resume";
  piSessionPath?: string | null;
  agentTimeoutMs?: number;
}): Promise<HeadlessPiRunResult> {
  const client = new PiRpcClient();
  const mergedEnv = { ...options.spawn.env, ...options.env };
  const messages: unknown[] = [];
  let assistantText = "";
  let agentEnded = false;
  const sessionMode = options.sessionMode ?? "new";

  const onPiEvent = (event: PiEvent) => {
    options.onEvent?.(event);
    const e = event as { type?: string; message?: { role?: string; content?: unknown } };

    if (e.type === "message_end" && e.message) {
      messages.push(e.message);
      if (e.message.role === "assistant") {
        assistantText += extractText(e.message.content);
      }
    }

    if (e.type === "agent_end") {
      agentEnded = true;
    }
  };

  client.on("event", onPiEvent);
  const detachUi = autoRespondExtensionUi(client);

  try {
    await client.start({
      command: options.spawn.command,
      args: options.spawn.args,
      cwd: options.cwd,
      env: mergedEnv,
      fallback: options.spawn.fallback
        ? {
            command: options.spawn.fallback.command,
            args: options.spawn.fallback.args,
            env: { ...mergedEnv, ...options.spawn.fallback.env },
          }
        : undefined,
    });
    await waitUntilReady(client);

    if (sessionMode === "resume") {
      if (!options.piSessionPath?.trim()) {
        throw new Error("Pi session path is required to resume a Linear agent workspace");
      }
      const switchResponse = await client.send({
        type: "switch_session",
        sessionPath: options.piSessionPath,
      });
      if (!switchResponse.success) {
        throw new Error("Failed to switch to saved Pi session");
      }
    } else {
      await client.send({ type: "new_session" });
    }

    if (options.model) {
      await client.send({
        type: "set_model",
        provider: options.model.provider,
        modelId: options.model.modelId,
      });
    }

    const promptPromise =
      sessionMode === "resume"
        ? client.send({ type: "follow_up", message: options.prompt })
        : client.send({ type: "prompt", message: options.prompt });
    const deadline = Date.now() + (options.agentTimeoutMs ?? AGENT_TIMEOUT_MS);

    while (!agentEnded && Date.now() < deadline) {
      if (!client.isRunning) break;
      await delay(250);
    }

    if (!agentEnded) {
      await client.send({ type: "abort" }).catch(() => {});
      throw new Error("Workflow agent timed out");
    }

    await promptPromise.catch(() => {});

    const piSessionPath = await readPiSessionPath(client);
    const messagesResponse = await client.send({ type: "get_messages" });
    if (messagesResponse.success) {
      const data = messagesResponse.data as { messages?: unknown[] } | undefined;
      if (data?.messages?.length) {
        return {
          messages: data.messages,
          assistantText: extractAssistantText(data.messages),
          piSessionPath,
        };
      }
    }

    return { messages, assistantText, piSessionPath };
  } finally {
    detachUi();
    client.off("event", onPiEvent);
    await client.stop().catch(() => {});
    options.onAuthFileReleased?.(mergedEnv);
  }
}

export function createPiRunner(resolveSpawn: (rpcArgs: string[]) => PiSpawnConfig): WorkflowPiRunner {
  return {
    run: (options) =>
      runHeadlessPiPrompt({
        spawn: resolveSpawn(["--mode", "rpc"]),
        cwd: options.cwd,
        prompt: options.prompt,
        model: options.model,
        env: options.env,
        onEvent: options.onEvent as ((event: PiEvent) => void) | undefined,
        sessionMode: options.sessionMode,
        piSessionPath: options.piSessionPath,
        agentTimeoutMs: options.agentTimeoutMs,
      }),
  };
}
