import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piRoot = path.resolve(__dirname, "../../../vendor/pi");

if (!existsSync(path.join(piRoot, "package.json"))) {
  console.error(
    "[pi-vendor] vendor/pi is missing. Run: git submodule update --init --recursive",
  );
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: piRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[pi-vendor] Installing Pi dependencies (npm ci)...");
run("npm", ["ci", "--ignore-scripts"]);

console.log("[pi-vendor] Building Pi (tui → ai → agent → coding-agent)...");
run("npm", ["run", "build"]);

console.log("[pi-vendor] Done.");
