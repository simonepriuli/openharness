import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CloudWorkerConfig } from "./config.js";

const VENDORED_PI_CLI = join("vendor", "pi", "packages", "coding-agent", "dist", "cli.js");
const STAGED_PI_CLI = join("pi", "packages", "coding-agent", "dist", "cli.js");

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, VENDORED_PI_CLI))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveVendoredPiCli(openHarnessRoot: string | null): string | null {
  const candidates = [
    openHarnessRoot,
    findRepoRoot(process.cwd()),
    findRepoRoot(fileURLToPath(new URL(".", import.meta.url))),
  ];

  for (const root of candidates) {
    if (!root) continue;
    for (const relative of [STAGED_PI_CLI, VENDORED_PI_CLI]) {
      const cliPath = join(root, relative);
      if (existsSync(cliPath)) {
        return cliPath;
      }
    }
  }
  return null;
}

function resolveGlobalPiBin(): string {
  try {
    return execSync("which pi", { encoding: "utf8" }).trim();
  } catch {
    return "pi";
  }
}

function resolvePiNodeRuntime(): string {
  if (process.env.PI_NODE?.trim()) {
    return process.env.PI_NODE.trim();
  }
  const fromEnv = process.env.npm_node_execpath;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  try {
    const node = execSync("which node", { encoding: "utf8" }).trim();
    if (node && existsSync(node)) {
      return node;
    }
  } catch {
    // fall through
  }
  return process.execPath;
}

function isNodeScript(bin: string): boolean {
  return bin.endsWith(".js");
}

export function resolveCloudPiBin(config: CloudWorkerConfig): string {
  if (process.env.PI_BIN?.trim()) {
    return process.env.PI_BIN.trim();
  }
  const vendored = resolveVendoredPiCli(config.openHarnessRoot);
  if (vendored) {
    return vendored;
  }
  return resolveGlobalPiBin();
}

export function resolveCloudPiSpawn(
  config: CloudWorkerConfig,
  rpcArgs: string[],
  options: { piAgentDir: string; exaApiKey?: string | null },
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const bin = resolveCloudPiBin(config);
  const baseEnv = { ...process.env };

  if (isNodeScript(bin)) {
    const runtimeRoot = join(bin, "..", "..", "..", "..");
    const node = resolvePiNodeRuntime();
    return {
      command: node,
      args: [bin, ...rpcArgs],
      env: {
        ...baseEnv,
        OPENHARNESS_PI_ROOT: runtimeRoot,
        PI_CODING_AGENT_DIR: options.piAgentDir,
        ...(options.exaApiKey ? { EXA_API_KEY: options.exaApiKey } : {}),
      },
    };
  }

  return {
    command: bin,
    args: rpcArgs,
    env: {
      ...baseEnv,
      PI_CODING_AGENT_DIR: options.piAgentDir,
      ...(options.exaApiKey ? { EXA_API_KEY: options.exaApiKey } : {}),
    },
  };
}
