import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VENDORED_PI_CLI = path.join(
  "vendor",
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

/** Resolve the `pi` executable: PI_BIN → vendored submodule build → global PATH. */
export function resolvePiBin(): string {
  if (process.env.PI_BIN) {
    return process.env.PI_BIN;
  }

  const vendored = resolveVendoredPiCli();
  if (vendored) {
    return vendored;
  }

  return resolveGlobalPiBin();
}
