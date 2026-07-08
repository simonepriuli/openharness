#!/usr/bin/env node
import { readPinSha, resolveVendorPiShaForPin, syncVendorPiSha } from "./vendor-pi-sha.mjs";

function parseArgs(argv) {
  return {
    check: argv.includes("--check"),
    stage: argv.includes("--stage"),
  };
}

function main() {
  const { check, stage } = parseArgs(process.argv.slice(2));

  if (check) {
    const expected = resolveVendorPiShaForPin();
    const actual = readPinSha();
    if (actual !== expected) {
      console.error(
        `[sync-vendor-pi-sha] vendor/pi.sha is out of sync (have ${actual ?? "missing"}, want ${expected})`,
      );
      console.error("[sync-vendor-pi-sha] Run: pnpm sync:pi-sha");
      process.exit(1);
    }
    return;
  }

  const { changed, sha } = syncVendorPiSha({ stage });
  if (changed) {
    console.log(`[sync-vendor-pi-sha] Updated vendor/pi.sha -> ${sha}`);
  } else {
    console.log(`[sync-vendor-pi-sha] vendor/pi.sha already matches ${sha}`);
  }
}

main();
