/**
 * Wrappers around @vercel/sandbox v2 named-sandbox APIs (fork, getOrCreate, get by name).
 * Workspace pins `@vercel/sandbox@2.4.0` — run `pnpm install` if your editor still shows v1 types.
 */
import { Sandbox } from "@vercel/sandbox";
import { runSandboxName } from "./sandbox-names.js";
import { SANDBOX_INITIAL_TIMEOUT_MS } from "./sandbox-dispatch-env.js";

type SnapshotSource = {
  type: "snapshot";
  snapshotId: string;
};

type SandboxSessionStatus =
  | "aborted"
  | "failed"
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "snapshotting";

type SandboxStaticV2 = {
  get(params: { name: string; resume?: boolean; signal?: AbortSignal }): Promise<Sandbox>;
  getOrCreate(params?: {
    name?: string;
    source?: SnapshotSource;
    persistent?: boolean;
    timeout?: number;
    onCreate?: (sandbox: Sandbox) => Promise<void>;
    signal?: AbortSignal;
  }): Promise<Sandbox>;
  fork(params: {
    sourceSandbox: string;
    name?: string;
    persistent?: boolean;
    timeout?: number;
    env?: Record<string, string>;
    signal?: AbortSignal;
  }): Promise<Sandbox>;
  create(params?: {
    name?: string;
    source?: SnapshotSource;
    persistent?: boolean;
    timeout?: number;
    signal?: AbortSignal;
  }): Promise<Sandbox>;
};

const sandboxApi = Sandbox as unknown as SandboxStaticV2;

export type GetOrCreateSandboxParams = {
  name: string;
  source: SnapshotSource;
  persistent: boolean;
  onCreate?: (sandbox: Sandbox) => Promise<void>;
};

export async function getSandboxByName(
  name: string,
  options?: { resume?: boolean },
): Promise<Sandbox> {
  return sandboxApi.get({ name, resume: options?.resume ?? false });
}

export async function getOrCreateSandbox(params: GetOrCreateSandboxParams): Promise<Sandbox> {
  return sandboxApi.getOrCreate({
    name: params.name,
    source: params.source,
    persistent: params.persistent,
    onCreate: params.onCreate,
  });
}

export async function forkSandbox(input: {
  templateName: string;
  runId: string;
  env: Record<string, string>;
  timeout?: number;
  persistent?: boolean;
  sandboxName?: string;
}): Promise<Sandbox> {
  return sandboxApi.fork({
    sourceSandbox: input.templateName,
    name: input.sandboxName ?? runSandboxName(input.runId),
    persistent: input.persistent ?? false,
    timeout: input.timeout ?? SANDBOX_INITIAL_TIMEOUT_MS,
    env: input.env,
  });
}

export async function createSnapshotSandbox(input: {
  bundleSnapshotId: string;
  runId?: string;
  timeout?: number;
}): Promise<Sandbox> {
  return sandboxApi.create({
    name: input.runId ? runSandboxName(input.runId) : undefined,
    source: { type: "snapshot", snapshotId: input.bundleSnapshotId },
    persistent: false,
    timeout: input.timeout ?? SANDBOX_INITIAL_TIMEOUT_MS,
  });
}

export async function stopSandbox(sandbox: Sandbox): Promise<void> {
  const status = sandbox.status as SandboxSessionStatus;
  if (status === "stopped" || status === "stopping") {
    return;
  }
  try {
    await sandbox.stop();
  } catch {
    // Best effort.
  }
}
