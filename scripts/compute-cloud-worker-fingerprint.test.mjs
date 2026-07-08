import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeCloudWorkerFingerprint,
  vendorPiSubmoduleSha,
} from "./compute-cloud-worker-fingerprint.mjs";
import { readPinSha, readShaFromParentGitLink } from "./vendor-pi-sha.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/compute-cloud-worker-fingerprint.mjs");

describe("computeCloudWorkerFingerprint", () => {
  it("returns a stable sha256 fingerprint", async () => {
    const first = await computeCloudWorkerFingerprint();
    const second = await computeCloudWorkerFingerprint();
    assert.match(first, /^sha256:[a-f0-9]{64}$/);
    assert.equal(first, second);
  });

  it("supports --check for CI skip logic", () => {
    const computed = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    assert.equal(computed.status, 0);
    const fingerprint = computed.stdout.trim();

    const match = spawnSync(process.execPath, [scriptPath, "--check", fingerprint], {
      encoding: "utf8",
    });
    assert.equal(match.status, 0);

    const mismatch = spawnSync(process.execPath, [scriptPath, "--check", "sha256:dead"], {
      encoding: "utf8",
    });
    assert.equal(mismatch.status, 1);
  });

  it("supports --write for API build integration", () => {
    const outPath = path.join(repoRoot, "apps/api/src/cloud-worker/bundle-fingerprint.test-generated.ts");
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--write", outPath],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^sha256:[a-f0-9]{64}$/);
    const written = readFileSync(outPath, "utf8");
    assert.match(written, /EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT/);
    rmSync(outPath, { force: true });
  });

  it("resolves vendor/pi SHA from the git submodule pointer", () => {
    const gitSha = readShaFromParentGitLink();
    if (!gitSha) return;
    assert.equal(vendorPiSubmoduleSha(), gitSha);
  });

  it("keeps vendor/pi.sha in sync with the git submodule pointer", () => {
    const gitSha = readShaFromParentGitLink();
    if (!gitSha) return;
    const pinSha = readPinSha();
    assert.equal(pinSha, gitSha);
  });
});
