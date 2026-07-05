import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isCloudWorkerBundleInSync,
  isSandboxDispatchEnabled,
  sandboxDispatchDisabledReason,
} from "./sandbox-dispatch-env.js";

describe("isSandboxDispatchEnabled", () => {
  const original = {
    vercel: process.env.VERCEL,
    snapshotId: process.env.CLOUD_WORKER_SNAPSHOT_ID,
    secret: process.env.CLOUD_WORKER_SECRET,
    fingerprint: process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT,
  };

  it("requires Vercel, snapshot id, secret, and matching fingerprint", () => {
    delete process.env.VERCEL;
    delete process.env.CLOUD_WORKER_SNAPSHOT_ID;
    delete process.env.CLOUD_WORKER_SECRET;
    delete process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT;
    assert.equal(isSandboxDispatchEnabled(), false);

    process.env.VERCEL = "1";
    process.env.CLOUD_WORKER_SNAPSHOT_ID = "snap_test";
    assert.equal(isSandboxDispatchEnabled(), false);

    process.env.CLOUD_WORKER_SECRET = "secret";
    assert.equal(isSandboxDispatchEnabled(), false);

    process.env.VERCEL = original.vercel;
    process.env.CLOUD_WORKER_SNAPSHOT_ID = original.snapshotId;
    process.env.CLOUD_WORKER_SECRET = original.secret;
    process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT = original.fingerprint;
  });

  it("reports fingerprint mismatch on Vercel when env is unset", () => {
    process.env.VERCEL = "1";
    process.env.CLOUD_WORKER_SNAPSHOT_ID = "snap_test";
    process.env.CLOUD_WORKER_SECRET = "secret";
    delete process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT;

    assert.equal(isCloudWorkerBundleInSync(), false);
    assert.match(
      sandboxDispatchDisabledReason() ?? "",
      /fingerprint mismatch/,
    );

    process.env.VERCEL = original.vercel;
    process.env.CLOUD_WORKER_SNAPSHOT_ID = original.snapshotId;
    process.env.CLOUD_WORKER_SECRET = original.secret;
    process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT = original.fingerprint;
  });

  it("enables dispatch when embedded fingerprint matches env", () => {
    const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const repoRoot = path.resolve(apiDir, "../..");
    const generatedPath = path.join(apiDir, "src/cloud-worker/bundle-fingerprint.generated.ts");
    const originalGenerated = readFileSync(generatedPath, "utf8");

    const fingerprintScript = path.join(repoRoot, "scripts/compute-cloud-worker-fingerprint.mjs");
    const computed = spawnSync(process.execPath, [fingerprintScript], { encoding: "utf8" });
    assert.equal(computed.status, 0);
    const fingerprint = computed.stdout.trim();

    const evalScript = `
        import { writeFileSync } from "node:fs";
        import path from "node:path";
        const generatedPath = path.join(${JSON.stringify(path.join(apiDir, "src/cloud-worker"))}, "bundle-fingerprint.generated.ts");
        writeFileSync(generatedPath, "export const EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT = " + JSON.stringify(${JSON.stringify(fingerprint)}) + ";\\n");
        process.env.VERCEL = "1";
        process.env.CLOUD_WORKER_SNAPSHOT_ID = "snap_test";
        process.env.CLOUD_WORKER_SECRET = "secret";
        process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT = ${JSON.stringify(fingerprint)};
        const { isSandboxDispatchEnabled } = await import("./src/cloud-worker/sandbox-dispatch-env.ts");
        console.log(isSandboxDispatchEnabled() ? "enabled" : "disabled");
      `;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", evalScript],
      {
        cwd: apiDir,
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "enabled");

    writeFileSync(generatedPath, originalGenerated);
  });
});
