/**
 * Fail fast when vendor/pi dependencies are incomplete (common after interrupted installs).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = path.join(repoRoot, "vendor/pi");
const cliPath = path.join(piRoot, "packages/coding-agent/dist/cli.js");

if (!existsSync(path.join(piRoot, "package.json"))) {
  console.error(
    "[openharness] vendor/pi is missing. Run: git submodule update --init --recursive",
  );
  process.exit(1);
}

if (!existsSync(cliPath)) {
  console.error("[openharness] Pi CLI is not built. Run: pnpm build:pi");
  process.exit(1);
}

const node = process.env.PI_NODE ?? process.execPath;
const result = spawnSync(node, [cliPath, "--version"], {
  cwd: piRoot,
  encoding: "utf8",
  timeout: 15_000,
});

if (result.status === 0) {
  process.exit(0);
}

const stderr = (result.stderr ?? "").trim();
console.error("[openharness] vendor/pi failed to start.");
if (stderr) {
  console.error(stderr.split("\n").slice(-6).join("\n"));
}
console.error("Run: pnpm build:pi");
process.exit(1);
