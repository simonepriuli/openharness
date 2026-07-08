/**
 * Keeps vendor/pi.sha aligned with the parent repo's recorded vendor/pi submodule SHA.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_PI_SHA_PATH = path.join(repoRoot, "vendor/pi.sha");

const SHA_RE = /^[0-9a-f]{40}$/;

function parseSubmoduleSha(line) {
  const match = line.trim().match(/^160000 commit ([0-9a-f]{40})(?:\t|\s+).+$/);
  return match?.[1] ?? null;
}

export function readShaFromGitIndex() {
  const result = spawnSync("git", ["ls-files", "-s", "vendor/pi"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return parseSubmoduleSha(result.stdout);
}

export function readShaFromParentGitLink() {
  const result = spawnSync("git", ["ls-tree", "HEAD", "vendor/pi"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return parseSubmoduleSha(result.stdout);
}

export function readShaFromGitModulesHead() {
  const gitModulesHead = path.join(repoRoot, ".git/modules/vendor/pi/HEAD");
  if (!statSync(gitModulesHead, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  const head = readFileSync(gitModulesHead, "utf8").trim();
  if (!head.startsWith("ref: ")) return SHA_RE.test(head) ? head : null;
  const refPath = path.join(repoRoot, ".git/modules/vendor/pi", head.slice(5));
  const sha = readFileSync(refPath, "utf8").trim();
  return SHA_RE.test(sha) ? sha : null;
}

export function readShaFromSubmoduleCheckout() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: path.join(repoRoot, "vendor/pi"),
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return SHA_RE.test(sha) ? sha : null;
}

/** SHA that vendor/pi.sha should record (git index, then committed parent pointer). */
export function resolveVendorPiShaForPin() {
  const sha = readShaFromGitIndex() ?? readShaFromParentGitLink();
  if (sha) return sha;
  throw new Error(
    "Could not resolve vendor/pi submodule commit from git index or HEAD (stage vendor/pi first)",
  );
}

/** SHA used for runtime fingerprinting when git metadata is incomplete (e.g. CI checkout). */
export function resolveVendorPiShaForFingerprint() {
  const sha =
    readShaFromGitModulesHead() ??
    readShaFromSubmoduleCheckout() ??
    readShaFromParentGitLink() ??
    readPinSha();
  if (sha) return sha;
  throw new Error(
    "Could not resolve vendor/pi submodule commit (git metadata missing; ensure vendor/pi.sha is committed)",
  );
}

export function readPinSha() {
  if (!statSync(VENDOR_PI_SHA_PATH, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  const sha = readFileSync(VENDOR_PI_SHA_PATH, "utf8").trim();
  return SHA_RE.test(sha) ? sha : null;
}

export function writePinSha(sha) {
  writeFileSync(VENDOR_PI_SHA_PATH, `${sha}\n`);
}

export function syncVendorPiSha(options = {}) {
  const sha = resolveVendorPiShaForPin();
  const current = readPinSha();
  const changed = current !== sha;
  if (changed) {
    writePinSha(sha);
  }
  if (changed && options.stage) {
    const result = spawnSync("git", ["add", "vendor/pi.sha"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || "Failed to stage vendor/pi.sha");
    }
  }
  return { changed, sha };
}
