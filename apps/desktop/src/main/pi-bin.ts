import { app } from "electron";
import { execSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPiAgentDir } from "./pi-config.js";
import { appStore } from "./store.js";
import { getExaApiKey } from "./exa-config.js";

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

const PACKAGED_NODE_DIR = "node";

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

function isUsableNodeRuntime(nodePath: string): boolean {
  try {
    accessSync(nodePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolvePackagedNodeRuntime(): string | null {
  if (!app.isPackaged) {
    return null;
  }
  const nodeName = process.platform === "win32" ? "node.exe" : "node";
  const nodePath = path.join(process.resourcesPath, PACKAGED_NODE_DIR, nodeName);
  return isUsableNodeRuntime(nodePath) ? nodePath : null;
}

/** macOS Helper has LSUIElement and avoids a second Dock icon when running as Node. */
function resolveMacElectronHelperRuntime(): string | null {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return null;
  }
  const helperName = `${app.getName()} Helper`;
  const helperPath = path.join(
    path.dirname(process.execPath),
    "..",
    "Frameworks",
    `${helperName}.app`,
    "Contents",
    "MacOS",
    helperName,
  );
  return isUsableNodeRuntime(helperPath) ? helperPath : null;
}

type PiNodeRuntime = {
  command: string;
  electronRunAsNode: boolean;
};

/** Node binary for spawning the vendored Pi CLI (prefers the bundled Node runtime). */
function resolvePiNodeRuntime(): PiNodeRuntime {
  const configuredNode = process.env.PI_NODE?.trim();
  if (configuredNode && isUsableNodeRuntime(configuredNode)) {
    return { command: configuredNode, electronRunAsNode: false };
  }
  if (app.isPackaged) {
    const packagedNode = resolvePackagedNodeRuntime();
    if (packagedNode) {
      return { command: packagedNode, electronRunAsNode: false };
    }
    return { command: process.execPath, electronRunAsNode: true };
  }
  const fromEnv = process.env.npm_node_execpath;
  if (fromEnv && existsSync(fromEnv)) {
    return { command: fromEnv, electronRunAsNode: false };
  }
  try {
    const node = execSync("which node", { encoding: "utf8" }).trim();
    if (node && existsSync(node)) {
      return { command: node, electronRunAsNode: false };
    }
  } catch {
    // fall through to Electron's Node
  }
  return { command: process.execPath, electronRunAsNode: true };
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

/** Spawn config for Pi RPC (uses bundled or system Node when the CLI is a .js file). */
export function resolvePiSpawn(rpcArgs: string[]): {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  fallback?: {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  };
} {
  const bin = resolvePiBin();
  const baseEnv = { ...process.env };
  const swarmDefaultModel = (appStore.get("swarmDefaultModel") ?? "").trim();

  const piAgentDir = getPiAgentDir();
  const exaApiKey = getExaApiKey();

  if (isNodeScript(bin)) {
    const runtimeRoot = path.dirname(
      path.dirname(path.dirname(path.dirname(bin))),
    );
    const { command: node, electronRunAsNode } = resolvePiNodeRuntime();
    const env = {
      ...baseEnv,
      ...(electronRunAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      OPENHARNESS_PI_ROOT: runtimeRoot,
      PI_CODING_AGENT_DIR: piAgentDir,
      ...(swarmDefaultModel ? { OPENHARNESS_SWARM_DEFAULT_MODEL: swarmDefaultModel } : {}),
      ...(exaApiKey ? { EXA_API_KEY: exaApiKey } : {}),
    };
    const spawnArgs = [bin, ...rpcArgs];
    // Safety net only: if the bundled Node ever fails to spawn, fall back to
    // Electron-as-Node (Helper on macOS to avoid a second Dock icon).
    const electronFallbackCommand =
      resolveMacElectronHelperRuntime() ?? process.execPath;
    const fallback = electronRunAsNode
      ? undefined
      : {
          command: electronFallbackCommand,
          args: spawnArgs,
          env: {
            ...env,
            ELECTRON_RUN_AS_NODE: "1",
          },
        };
    return {
      command: node,
      args: spawnArgs,
      env,
      fallback,
    };
  }

  return {
    command: bin,
    args: rpcArgs,
    env: {
      ...baseEnv,
      PI_CODING_AGENT_DIR: piAgentDir,
      ...(swarmDefaultModel ? { OPENHARNESS_SWARM_DEFAULT_MODEL: swarmDefaultModel } : {}),
      ...(exaApiKey ? { EXA_API_KEY: exaApiKey } : {}),
    },
  };
}
