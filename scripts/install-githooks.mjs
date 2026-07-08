import { chmodSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = path.join(repoRoot, ".git");
const hookSrc = path.join(repoRoot, ".githooks/pre-commit");
const hookDest = path.join(gitDir, "hooks/pre-commit");
const marker = "sync-vendor-pi-sha.mjs";

if (!existsSync(gitDir)) {
  process.exit(0);
}

if (!existsSync(hookSrc)) {
  console.warn("[install-githooks] Missing .githooks/pre-commit");
  process.exit(0);
}

if (existsSync(hookDest)) {
  const existing = readFileSync(hookDest, "utf8");
  if (existing.includes(marker)) {
    copyFileSync(hookSrc, hookDest);
    chmodSync(hookDest, 0o755);
    process.exit(0);
  }
  const backup = `${hookDest}.openharness-backup`;
  if (!existsSync(backup)) {
    copyFileSync(hookDest, backup);
    console.log("[install-githooks] Backed up existing pre-commit to pre-commit.openharness-backup");
  }
}

copyFileSync(hookSrc, hookDest);
chmodSync(hookDest, 0o755);
console.log("[install-githooks] Installed pre-commit hook (syncs vendor/pi.sha)");
