import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  readPinSha,
  readShaFromParentGitLink,
  resolveVendorPiShaForPin,
  syncVendorPiSha,
  VENDOR_PI_SHA_PATH,
} from "./vendor-pi-sha.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/sync-vendor-pi-sha.mjs");

describe("vendorPiSha", () => {
  it("resolveVendorPiShaForPin matches the committed submodule pointer", () => {
    const gitSha = readShaFromParentGitLink();
    if (!gitSha) return;
    assert.equal(resolveVendorPiShaForPin(), gitSha);
  });

  it("syncVendorPiSha writes vendor/pi.sha when out of sync", () => {
    const expected = resolveVendorPiShaForPin();
    const previous = readPinSha();
    const wrongSha = "0".repeat(40);
    writeFileSync(VENDOR_PI_SHA_PATH, `${wrongSha}\n`);

    try {
      const result = syncVendorPiSha();
      assert.equal(result.changed, true);
      assert.equal(result.sha, expected);
      assert.equal(readPinSha(), expected);
    } finally {
      if (previous) {
        writeFileSync(VENDOR_PI_SHA_PATH, `${previous}\n`);
      }
    }
  });

  it("sync script supports --check", () => {
    const expected = resolveVendorPiShaForPin();
    writeFileSync(VENDOR_PI_SHA_PATH, `${expected}\n`);
    const ok = spawnSync(process.execPath, [scriptPath, "--check"], { encoding: "utf8" });
    assert.equal(ok.status, 0);

    writeFileSync(VENDOR_PI_SHA_PATH, `${"f".repeat(40)}\n`);
    const bad = spawnSync(process.execPath, [scriptPath, "--check"], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    writeFileSync(VENDOR_PI_SHA_PATH, `${expected}\n`);
  });
});
