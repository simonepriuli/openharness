/**
 * Stage a production Pi runtime for electron-builder extraResources.
 * Output: apps/desktop/resources/pi-runtime (gitignored)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = path.join(repoRoot, "vendor/pi");
const dest = path.join(repoRoot, "apps/desktop/resources/pi-runtime");

const workspacePackages = [
  { dir: "agent", name: "@earendil-works/pi-agent-core" },
  { dir: "ai", name: "@earendil-works/pi-ai" },
  { dir: "tui", name: "@earendil-works/pi-tui" },
  { dir: "coding-agent", name: "@earendil-works/pi-coding-agent" },
];

function requirePath(p, label) {
  if (!existsSync(p)) {
    console.error(`[stage-pi-runtime] Missing ${label}: ${p}`);
    console.error("Run: pnpm build:pi");
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

function packPackage(pkgDir) {
  const output = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", dest],
    { cwd: pkgDir, encoding: "utf8" },
  );
  if (output.status !== 0) {
    process.exit(output.status ?? 1);
  }
  const packed = JSON.parse(output.stdout)[0];
  return path.join(dest, packed.filename);
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

const tarballs = new Map();
for (const pkg of workspacePackages) {
  const pkgDir = path.join(piRoot, "packages", pkg.dir);
  requirePath(path.join(pkgDir, "dist"), `packages/${pkg.dir}/dist`);
  tarballs.set(pkg.name, packPackage(pkgDir));
}

const fileDep = (tarball) => `file:${path.basename(tarball)}`;
const dependencies = Object.fromEntries(
  workspacePackages.map((pkg) => [pkg.name, fileDep(tarballs.get(pkg.name))]),
);

writeFileSync(
  path.join(dest, "package.json"),
  `${JSON.stringify({ private: true, dependencies, overrides: dependencies }, null, 2)}\n`,
  "utf8",
);

run("npm", ["install", "--omit=dev", "--ignore-scripts"], { cwd: dest });

for (const tarball of tarballs.values()) {
  rmSync(tarball, { force: true });
}

// CLI binaries are not needed in the packaged RPC runtime; they often symlink outside the bundle.
rmSync(path.join(dest, "node_modules", ".bin"), { recursive: true, force: true });

mkdirSync(path.join(dest, "packages"), { recursive: true });
for (const pkg of workspacePackages) {
  const srcPkg = path.join(piRoot, "packages", pkg.dir);
  const destPkg = path.join(dest, "packages", pkg.dir);
  mkdirSync(destPkg, { recursive: true });
  cpSync(path.join(srcPkg, "package.json"), path.join(destPkg, "package.json"));
  cpSync(path.join(srcPkg, "dist"), path.join(destPkg, "dist"), { recursive: true });
}

// Sanity check: the staged runtime must resolve core deps without the monorepo checkout.
const stagedAgentPkg = readFileSync(
  path.join(dest, "node_modules", "@earendil-works", "pi-agent-core", "package.json"),
  "utf8",
);
if (!stagedAgentPkg.includes('"name": "@earendil-works/pi-agent-core"')) {
  console.error("[stage-pi-runtime] Staged node_modules is missing workspace packages.");
  process.exit(1);
}

console.log(`[stage-pi-runtime] Wrote ${dest}`);
