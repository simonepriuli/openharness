import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { Sandbox } from "@vercel/sandbox";
import { SANDBOX_BUNDLE_ROOT } from "../cloud-worker/sandbox-dispatch-env.js";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(apiDir, "../..");

for (const file of [".env.local", ".env"]) {
  const envPath = path.join(apiDir, file);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
  }
}
const bundleDir = path.join(repoRoot, "apps/cloud-worker/runtime/openharness");
const tarballPath = path.join(tmpdir(), `openharness-cloud-worker-${Date.now()}.tar.gz`);

function run(command: string, args: string[], options: { cwd?: string } = {}): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function stageBundle(): Promise<void> {
  run("node", ["scripts/stage-cloud-worker-runtime.mjs"]);
  const stats = await stat(bundleDir);
  if (!stats.isDirectory()) {
    throw new Error(`Bundle directory missing: ${bundleDir}`);
  }
}

async function createTarball(): Promise<void> {
  await rm(tarballPath, { force: true });
  run("tar", ["-czf", tarballPath, "-C", path.dirname(bundleDir), path.basename(bundleDir)]);
}

function sandboxAuthFromEnv():
  | { token: string; teamId: string; projectId: string }
  | undefined {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }
  return undefined;
}

async function main(): Promise<void> {
  console.log("[create-cloud-worker-snapshot] staging bundle...");
  await stageBundle();
  await createTarball();

  const auth = sandboxAuthFromEnv();
  if (auth) {
    console.log("[create-cloud-worker-snapshot] using VERCEL_TOKEN credentials");
  } else if (process.env.VERCEL_OIDC_TOKEN?.trim()) {
    console.log("[create-cloud-worker-snapshot] using VERCEL_OIDC_TOKEN from env");
  } else {
    console.log(
      "[create-cloud-worker-snapshot] no explicit credentials — SDK will try OIDC or interactive login",
    );
  }

  console.log("[create-cloud-worker-snapshot] creating sandbox...");
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 300_000,
    ...auth,
  });

  try {
    const tarball = await readFile(tarballPath);
    await sandbox.writeFiles([
      {
        path: "/vercel/sandbox/openharness-bundle.tar.gz",
        content: tarball,
      },
    ]);

    const extract = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `mkdir -p ${SANDBOX_BUNDLE_ROOT} && tar -xzf /vercel/sandbox/openharness-bundle.tar.gz -C /vercel/sandbox`,
      ],
    });
    if (extract.exitCode !== 0) {
      throw new Error(`Failed to extract bundle (exit ${extract.exitCode})`);
    }

    const verify = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `git --version && node ${SANDBOX_BUNDLE_ROOT}/cloud-worker/dist/index.js help`,
      ],
      stdout: process.stdout,
      stderr: process.stderr,
    });
    if (verify.exitCode !== 0) {
      throw new Error(`Bundle verification failed (exit ${verify.exitCode})`);
    }

    console.log("[create-cloud-worker-snapshot] creating snapshot...");
    const snapshot = await sandbox.snapshot();
    console.log("\nSnapshot created successfully.\n");
    console.log(`CLOUD_WORKER_SNAPSHOT_ID=${snapshot.snapshotId}`);
    console.log("\nAdd this to your Vercel project environment variables.");
  } finally {
    await rm(tarballPath, { force: true });
    try {
      await sandbox.stop();
    } catch {
      // snapshot() stops the sandbox
    }
  }
}

main().catch((err) => {
  console.error("[create-cloud-worker-snapshot] failed", err);
  process.exit(1);
});
