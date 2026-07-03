/**
 * Stage a slim cloud-worker runtime bundle for Vercel Sandbox snapshots.
 * Output: apps/cloud-worker/runtime/openharness (gitignored)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeCloudWorkerFingerprint } from "./compute-cloud-worker-fingerprint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { fingerprint: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--fingerprint" && argv[i + 1]) {
      args.fingerprint = argv[++i];
    }
  }
  return args;
}

function resolveGitSha() {
  if (process.env.GITHUB_SHA?.trim()) {
    return process.env.GITHUB_SHA.trim();
  }
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return "unknown";
}
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
run("pnpm", ["--filter", "@openharness/pi-rpc", "build"]);
run("pnpm", ["--filter", "@openharness/workflow-executor", "build"]);
run("pnpm", ["--filter", "cloud-worker", "build"]);

const openHarnessPackages = [
  { dir: "packages/shared", name: "@openharness/shared" },
  { dir: "packages/pi-rpc", name: "@openharness/pi-rpc" },
  { dir: "packages/workflow-executor", name: "@openharness/workflow-executor" },
];

function packPackage(pkgDir, outputDir) {
  const output = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", outputDir],
    { cwd: pkgDir, encoding: "utf8" },
  );
  if (output.status !== 0) process.exit(output.status ?? 1);
  const packed = JSON.parse(output.stdout)[0];
  return path.join(outputDir, packed.filename);
}

function stageCloudWorkerDeps(destRoot) {
  const tarballs = new Map();
  for (const pkg of openHarnessPackages) {
    const pkgDir = path.join(repoRoot, pkg.dir);
    requirePath(path.join(pkgDir, "dist"), `${pkg.dir}/dist`);
    tarballs.set(pkg.name, packPackage(pkgDir, destRoot));
  }

  const fileDep = (tarball) => `file:${path.basename(tarball)}`;
  const workspaceDeps = Object.fromEntries(
    openHarnessPackages.map((pkg) => [pkg.name, fileDep(tarballs.get(pkg.name))]),
  );

  const cloudWorkerPkg = JSON.parse(
    readFileSync(path.join(repoRoot, "apps/cloud-worker/package.json"), "utf8"),
  );

  const dependencies = {
    ...workspaceDeps,
    dotenv: cloudWorkerPkg.dependencies.dotenv,
    "@vercel/sandbox": cloudWorkerPkg.dependencies["@vercel/sandbox"],
  };

  writeFileSync(
    path.join(destRoot, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies,
        overrides: workspaceDeps,
      },
      null,
      2,
    )}\n`,
  );

  run("npm", ["install", "--omit=dev", "--ignore-scripts"], { cwd: destRoot });

  for (const tarball of tarballs.values()) {
    rmSync(tarball, { force: true });
  }
}

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

const workflowNotifySrc = path.join(repoRoot, "apps/desktop/pi-extensions/workflow-notify");
requirePath(path.join(workflowNotifySrc, "index.ts"), "workflow-notify extension");
cpSync(workflowNotifySrc, path.join(dest, "extensions/workflow-notify"), { recursive: true });

const linearActionsSrc = path.join(repoRoot, "apps/desktop/pi-extensions/linear-actions");
requirePath(path.join(linearActionsSrc, "index.ts"), "linear-actions extension");
cpSync(linearActionsSrc, path.join(dest, "extensions/linear-actions"), { recursive: true });

stagePiRuntime(path.join(dest, "pi"));
stageCloudWorkerDeps(dest);

const { fingerprint: fingerprintArg } = parseArgs(process.argv.slice(2));
const bundleFingerprint = fingerprintArg ?? (await computeCloudWorkerFingerprint());

writeFileSync(
  path.join(dest, "manifest.json"),
  `${JSON.stringify(
    {
      bundleRoot: "/vercel/sandbox/openharness",
      cloudWorkerEntry: "cloud-worker/dist/index.js",
      piCli: "pi/packages/coding-agent/dist/cli.js",
      bundleFingerprint,
      gitSha: resolveGitSha(),
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

const piCli = path.join(dest, "pi/packages/coding-agent/dist/cli.js");
requirePath(path.join(dest, "cloud-worker/dist/index.js"), "cloud-worker build output");
requirePath(path.join(dest, "node_modules/dotenv"), "cloud-worker runtime node_modules");
requirePath(piCli, "staged Pi CLI");

const isolatedVerify = spawnSync(
  process.execPath,
  [path.join(dest, "cloud-worker/dist/index.js"), "help"],
  {
    cwd: dest,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "" },
  },
);
if (isolatedVerify.status !== 0) {
  console.error(isolatedVerify.stdout);
  console.error(isolatedVerify.stderr);
  console.error("[stage-cloud-worker-runtime] Isolated cloud-worker verification failed");
  process.exit(isolatedVerify.status ?? 1);
}

console.log(`[stage-cloud-worker-runtime] Wrote ${dest}`);
