import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.OPENHARNESS_SKIP_PI_BUILD === "1") {
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = path.join(repoRoot, "vendor/pi");

if (!existsSync(path.join(piRoot, "package.json"))) {
  console.log(
    "[postinstall] vendor/pi not present; skip Pi build (run git submodule update --init)",
  );
  process.exit(0);
}

const result = spawnSync("pnpm", ["run", "build:pi"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
