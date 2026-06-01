/**
 * Stage a production Pi runtime for electron-builder extraResources.
 * Output: apps/desktop/resources/pi-runtime (gitignored)
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = path.join(repoRoot, "vendor/pi");
const dest = path.join(repoRoot, "apps/desktop/resources/pi-runtime");

const workspacePackages = ["tui", "ai", "agent", "coding-agent"];

function requirePath(p, label) {
  if (!existsSync(p)) {
    console.error(`[stage-pi-runtime] Missing ${label}: ${p}`);
    console.error("Run: pnpm build:pi");
    process.exit(1);
  }
}

requirePath(piRoot, "vendor/pi");
requirePath(
  path.join(piRoot, "packages/coding-agent/dist/cli.js"),
  "built Pi CLI",
);

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

for (const name of ["package.json", "package-lock.json"]) {
  cpSync(path.join(piRoot, name), path.join(dest, name));
}

cpSync(path.join(piRoot, "node_modules"), path.join(dest, "node_modules"), {
  recursive: true,
  dereference: true,
});

mkdirSync(path.join(dest, "packages"), { recursive: true });

for (const pkg of workspacePackages) {
  const srcPkg = path.join(piRoot, "packages", pkg);
  const destPkg = path.join(dest, "packages", pkg);
  mkdirSync(destPkg, { recursive: true });
  cpSync(path.join(srcPkg, "package.json"), path.join(destPkg, "package.json"));
  requirePath(path.join(srcPkg, "dist"), `packages/${pkg}/dist`);
  cpSync(path.join(srcPkg, "dist"), path.join(destPkg, "dist"), {
    recursive: true,
  });
}

console.log(`[stage-pi-runtime] Wrote ${dest}`);
