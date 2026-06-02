import { app } from "electron";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPiAgentDir } from "./pi-config.js";
import { appStore } from "./store.js";

const VENDORED_PI_CLI = path.join(
  "vendor",
  "pi",
  "packages",
  "coding-agent",
  "dist",
  "cli.js",
);

const PACKAGED_PI_CLI = path.join(
  "pi",
  "packages",
  "coding-agent",
  "dist",
  "cli.js",
);

function findRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, VENDORED_PI_CLI))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function resolvePackagedPiCli(): string | null {
  if (!app.isPackaged) {
    return null;
  }
  const cliPath = path.join(process.resourcesPath, PACKAGED_PI_CLI);
  return existsSync(cliPath) ? cliPath : null;
}

function resolveVendoredPiCli(): string | null {
  const candidates = [
    process.env.OPENHARNESS_ROOT,
    findRepoRoot(process.cwd()),
    findRepoRoot(path.dirname(fileURLToPath(import.meta.url))),
  ];

  for (const root of candidates) {
    if (!root) {
      continue;
    }
    const cliPath = path.join(root, VENDORED_PI_CLI);
    if (existsSync(cliPath)) {
      return cliPath;
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

/** Node binary for spawning vendored Pi CLI without a second Electron dock icon (dev). */
function resolvePiNodeRuntime(): string {
  if (process.env.PI_NODE) {
    return process.env.PI_NODE;
  }
  if (app.isPackaged) {
    return process.execPath;
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
    // fall through to Electron's Node
  }
  return process.execPath;
}

function isNodeScript(bin: string): boolean {
  return bin.endsWith(".js");
}

/** Resolve the `pi` executable: PI_BIN → bundled app → vendored build → global PATH. */
export function resolvePiBin(): string {
  if (process.env.PI_BIN) {
    return process.env.PI_BIN;
  }

  const packaged = resolvePackagedPiCli();
  if (packaged) {
    return packaged;
  }

  const vendored = resolveVendoredPiCli();
  if (vendored) {
    return vendored;
  }

  return resolveGlobalPiBin();
}

/** Spawn config for Pi RPC (uses Electron's Node when the CLI is a .js file). */
export function resolvePiSpawn(rpcArgs: string[]): {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const bin = resolvePiBin();
  const baseEnv = { ...process.env };
  const swarmDefaultModel = (appStore.get("swarmDefaultModel") ?? "").trim();

  const piAgentDir = getPiAgentDir();

  if (isNodeScript(bin)) {
    const runtimeRoot = path.dirname(
      path.dirname(path.dirname(path.dirname(bin))),
    );
    const node = resolvePiNodeRuntime();
    const useElectronNode = node === process.execPath;
    return {
      command: node,
      args: [bin, ...rpcArgs],
      env: {
        ...baseEnv,
        ...(useElectronNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        OPENHARNESS_PI_ROOT: runtimeRoot,
        PI_CODING_AGENT_DIR: piAgentDir,
        ...(swarmDefaultModel ? { OPENHARNESS_SWARM_DEFAULT_MODEL: swarmDefaultModel } : {}),
      },
    };
  }

  return {
    command: bin,
    args: rpcArgs,
    env: {
      ...baseEnv,
      PI_CODING_AGENT_DIR: piAgentDir,
      ...(swarmDefaultModel ? { OPENHARNESS_SWARM_DEFAULT_MODEL: swarmDefaultModel } : {}),
    },
  };
}
