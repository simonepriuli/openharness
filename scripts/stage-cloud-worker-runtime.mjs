/**
 * Stage a slim cloud-worker runtime bundle for Vercel Sandbox snapshots.
 * Output: apps/cloud-worker/runtime/openharness (gitignored)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(repoRoot, "apps/cloud-worker/runtime/openharness");
const piRoot = path.join(repoRoot, "vendor/pi");
const desktopPiRuntime = path.join(repoRoot, "apps/desktop/resources/pi-runtime");

const workspacePackages = [
  { dir: "agent", name: "@earendil-works/pi-agent-core" },
  { dir: "ai", name: "@earendil-works/pi-ai" },
  { dir: "tui", name: "@earendil-works/pi-tui" },
  { dir: "coding-agent", name: "@earendil-works/pi-coding-agent" },
];

function requirePath(p, label) {
  if (!existsSync(p)) {
    console.error(`[stage-cloud-worker-runtime] Missing ${label}: ${p}`);
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stagePiRuntime(piDest) {
  if (existsSync(desktopPiRuntime)) {
    cpSync(desktopPiRuntime, piDest, { recursive: true });
    return;
  }

  requirePath(path.join(piRoot, "packages/coding-agent/dist/cli.js"), "built Pi CLI");
  mkdirSync(piDest, { recursive: true });

  const tarballs = new Map();
  for (const pkg of workspacePackages) {
    const pkgDir = path.join(piRoot, "packages", pkg.dir);
    requirePath(path.join(pkgDir, "dist"), `packages/${pkg.dir}/dist`);
    const output = spawnSync(
      "npm",
      ["pack", "--json", "--pack-destination", piDest],
      { cwd: pkgDir, encoding: "utf8" },
    );
    if (output.status !== 0) process.exit(output.status ?? 1);
    const packed = JSON.parse(output.stdout)[0];
    tarballs.set(pkg.name, path.join(piDest, packed.filename));
  }

  const fileDep = (tarball) => `file:${path.basename(tarball)}`;
  const dependencies = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, fileDep(tarballs.get(pkg.name))]),
  );

  writeFileSync(
    path.join(piDest, "package.json"),
    `${JSON.stringify({ private: true, dependencies, overrides: dependencies }, null, 2)}\n`,
  );
  run("npm", ["install", "--omit=dev", "--ignore-scripts"], { cwd: piDest });
  for (const tarball of tarballs.values()) {
    rmSync(tarball, { force: true });
  }
  rmSync(path.join(piDest, "node_modules", ".bin"), { recursive: true, force: true });

  mkdirSync(path.join(piDest, "packages"), { recursive: true });
  for (const pkg of workspacePackages) {
    const srcPkg = path.join(piRoot, "packages", pkg.dir);
    const destPkg = path.join(piDest, "packages", pkg.dir);
    mkdirSync(destPkg, { recursive: true });
    cpSync(path.join(srcPkg, "package.json"), path.join(destPkg, "package.json"));
    cpSync(path.join(srcPkg, "dist"), path.join(destPkg, "dist"), { recursive: true });
  }
}

run("pnpm", ["--filter", "@openharness/shared", "build"]);
run("pnpm", ["--filter", "@openharness/workflow-executor", "build"]);
run("pnpm", ["--filter", "cloud-worker", "build"]);

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

cpSync(path.join(repoRoot, "apps/cloud-worker/dist"), path.join(dest, "cloud-worker/dist"), {
  recursive: true,
});

const githubActionsSrc = path.join(repoRoot, "apps/desktop/pi-extensions/github-actions");
requirePath(path.join(githubActionsSrc, "index.ts"), "github-actions extension");
cpSync(githubActionsSrc, path.join(dest, "extensions/github-actions"), { recursive: true });

stagePiRuntime(path.join(dest, "pi"));

writeFileSync(
  path.join(dest, "manifest.json"),
  `${JSON.stringify(
    {
      bundleRoot: "/vercel/sandbox/openharness",
      cloudWorkerEntry: "cloud-worker/dist/index.js",
      piCli: "pi/packages/coding-agent/dist/cli.js",
    },
    null,
    2,
  )}\n`,
);

const piCli = path.join(dest, "pi/packages/coding-agent/dist/cli.js");
requirePath(path.join(dest, "cloud-worker/dist/index.js"), "cloud-worker build output");
requirePath(piCli, "staged Pi CLI");

console.log(`[stage-cloud-worker-runtime] Wrote ${dest}`);
