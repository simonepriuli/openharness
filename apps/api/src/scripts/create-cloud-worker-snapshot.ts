import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { Result } from "better-result";
import { Sandbox } from "@vercel/sandbox";
import { SANDBOX_BUNDLE_ROOT } from "../cloud-worker/sandbox-dispatch-env.js";
import { bestEffortAsync } from "../result-helpers.js";

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

function parseArgs(argv: string[]): { fingerprint: string | undefined; skipStage: boolean } {
  let fingerprint = process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT?.trim() || undefined;
  let skipStage = false;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--fingerprint" && argv[i + 1]) {
      fingerprint = argv[++i]?.trim() || undefined;
    } else if (argv[i] === "--skip-stage") {
      skipStage = true;
    }
  }

  return { fingerprint, skipStage };
}

function run(command: string, args: string[], options: { cwd?: string } = {}): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function stageBundle(fingerprint: string | undefined): Promise<void> {
  const stageArgs = ["scripts/stage-cloud-worker-runtime.mjs"];
  if (fingerprint) {
    stageArgs.push("--fingerprint", fingerprint);
  }
  run("node", stageArgs);
  const stats = await stat(bundleDir);
  if (!stats.isDirectory()) {
    throw new Error(`Bundle directory missing: ${bundleDir}`);
  }
}

async function readBundleFingerprint(): Promise<string> {
  const manifestPath = path.join(bundleDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    bundleFingerprint?: string;
  };
  const fingerprint = manifest.bundleFingerprint?.trim();
  if (!fingerprint) {
    throw new Error("Staged manifest.json is missing bundleFingerprint");
  }
  return fingerprint;
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
  let tarballCreated = false;
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined;

  const result = await Result.tryPromise({
    try: async () => {
      const { fingerprint: expectedFingerprint, skipStage } = parseArgs(process.argv.slice(2));

      if (!skipStage) {
        console.log("[create-cloud-worker-snapshot] staging bundle...");
        await stageBundle(expectedFingerprint);
      } else {
        console.log("[create-cloud-worker-snapshot] using pre-staged bundle...");
      }

      const bundleFingerprint = expectedFingerprint ?? (await readBundleFingerprint());
      await createTarball();
      tarballCreated = true;

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
      sandbox = await Sandbox.create({
        runtime: "node24",
        timeout: 300_000,
        ...auth,
      });

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

      const manifestCheck = await sandbox.runCommand({
        cmd: "node",
        args: [
          "-e",
          `const fs=require('fs');const m=JSON.parse(fs.readFileSync('${SANDBOX_BUNDLE_ROOT}/manifest.json','utf8'));` +
            `if(m.bundleFingerprint!==${JSON.stringify(bundleFingerprint)}){` +
            `console.error('manifest fingerprint mismatch:',m.bundleFingerprint,'!=',${JSON.stringify(bundleFingerprint)});` +
            `process.exit(1);}`,
        ],
      });
      if (manifestCheck.exitCode !== 0) {
        throw new Error("Bundle manifest fingerprint verification failed");
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
      const snapshot = await sandbox.snapshot({ expiration: 0 });
      console.log("\nSnapshot created successfully.\n");
      console.log(`CLOUD_WORKER_SNAPSHOT_ID=${snapshot.snapshotId}`);
      console.log(`CLOUD_WORKER_BUNDLE_FINGERPRINT=${bundleFingerprint}`);
      console.log("\nAdd these to your Vercel project environment variables.");
    },
    catch: (cause) => cause,
  });

  if (tarballCreated) {
    await bestEffortAsync("remove cloud-worker tarball", async () => {
      await rm(tarballPath, { force: true });
    });
  }
  if (sandbox) {
    const sandboxToStop = sandbox;
    await bestEffortAsync("stop sandbox", async () => {
      await sandboxToStop.stop();
    });
  }

  if (Result.isError(result)) {
    console.error("[create-cloud-worker-snapshot] failed", result.error);
    process.exit(1);
  }
}

main();
