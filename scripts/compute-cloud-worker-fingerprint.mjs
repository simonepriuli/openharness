/**
 * Deterministic fingerprint for the cloud-worker sandbox bundle inputs.
 * Used by CI skip logic, staging manifest, and API build-time dispatch guard.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_TREES = [
  "apps/cloud-worker",
  "packages/shared",
  "packages/pi-rpc",
  "packages/workflow-executor",
];

const LOCKFILE_IMPORTERS = [
  "apps/cloud-worker",
  "packages/shared",
  "packages/pi-rpc",
  "packages/workflow-executor",
];

const STAGE_SCRIPT = "scripts/stage-cloud-worker-runtime.mjs";
const FINGERPRINT_SCRIPT = "scripts/compute-cloud-worker-fingerprint.mjs";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "runtime",
  ".turbo",
  ".git",
]);

function walkFiles(dir, baseDir = dir) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkFiles(full, baseDir));
    } else if (stat.isFile()) {
      entries.push(path.relative(baseDir, full));
    }
  }
  return entries;
}

function hashFile(hash, filePath, label) {
  hash.update(`${label}\n`);
  const stream = createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
}

function readShaFromGitModulesHead() {
  const gitModulesHead = path.join(repoRoot, ".git/modules/vendor/pi/HEAD");
  if (!statSync(gitModulesHead, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  const head = readFileSync(gitModulesHead, "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  const refPath = path.join(repoRoot, ".git/modules/vendor/pi", head.slice(5));
  return readFileSync(refPath, "utf8").trim();
}

function readShaFromSubmoduleCheckout() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: path.join(repoRoot, "vendor/pi"),
    encoding: "utf8",
  });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return null;
}

function readShaFromParentGitLink() {
  const result = spawnSync("git", ["ls-tree", "HEAD", "vendor/pi"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const match = result.stdout.trim().match(/^160000 commit ([0-9a-f]{40})\tvendor\/pi$/);
  return match?.[1] ?? null;
}

function readShaFromPinFile() {
  const pinPath = path.join(repoRoot, "vendor/pi.sha");
  if (!statSync(pinPath, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  const sha = readFileSync(pinPath, "utf8").trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

export function vendorPiSubmoduleSha() {
  const sha =
    readShaFromGitModulesHead() ??
    readShaFromSubmoduleCheckout() ??
    readShaFromParentGitLink() ??
    readShaFromPinFile();
  if (sha) return sha;
  throw new Error(
    "Could not resolve vendor/pi submodule commit (git metadata missing; ensure vendor/pi.sha is committed)",
  );
}

function extractLockfileImporterSections(lockfilePath) {
  const content = readFileSync(lockfilePath, "utf8");
  const lines = content.split("\n");
  const sections = [];

  for (const importer of LOCKFILE_IMPORTERS) {
    const header = `  ${importer}:`;
    const start = lines.findIndex((line) => line === header);
    if (start === -1) {
      throw new Error(`Missing pnpm-lock importer section: ${importer}`);
    }
    let end = start + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (/^  [^\s].*:$/.test(line) && !line.startsWith("    ")) break;
      end += 1;
    }
    sections.push(lines.slice(start, end).join("\n"));
  }

  return sections.join("\n");
}

export async function computeCloudWorkerFingerprint() {
  const hash = createHash("sha256");

  for (const tree of SOURCE_TREES) {
    const abs = path.join(repoRoot, tree);
    const files = walkFiles(abs);
    for (const rel of files) {
      await hashFile(hash, path.join(abs, rel), `${tree}/${rel}`);
    }
  }

  hash.update(`vendor/pi@${vendorPiSubmoduleSha()}\n`);

  for (const script of [STAGE_SCRIPT, FINGERPRINT_SCRIPT]) {
    await hashFile(hash, path.join(repoRoot, script), script);
  }

  const lockSections = extractLockfileImporterSections(path.join(repoRoot, "pnpm-lock.yaml"));
  hash.update(`pnpm-lock.yaml\n${lockSections}\n`);

  return `sha256:${hash.digest("hex")}`;
}

function parseArgs(argv) {
  const args = { check: null, write: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check" && argv[i + 1]) {
      args.check = argv[++i];
    } else if (argv[i] === "--write" && argv[i + 1]) {
      args.write = argv[++i];
    }
  }
  return args;
}

function writeGeneratedModule(outPath, fingerprint) {
  const abs = path.isAbsolute(outPath) ? outPath : path.join(repoRoot, outPath);
  const contents = `// Generated by scripts/compute-cloud-worker-fingerprint.mjs — do not edit.
export const EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT: string | undefined = ${JSON.stringify(fingerprint)};
`;
  writeFileSync(abs, contents);
}

async function main() {
  const { check, write } = parseArgs(process.argv.slice(2));
  const fingerprint = await computeCloudWorkerFingerprint();

  if (check) {
    process.exit(check === fingerprint ? 0 : 1);
  }

  if (write) {
    writeGeneratedModule(write, fingerprint);
  }

  console.log(fingerprint);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("[compute-cloud-worker-fingerprint] failed", err);
    process.exit(1);
  });
}
