/**
 * Stage a standalone Node.js binary for electron-builder extraResources.
 * Used to run the bundled Pi CLI without spawning Electron again (macOS Dock icon).
 * Output: apps/desktop/resources/node-runtime (gitignored)
 */
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(repoRoot, "apps/desktop/resources/node-runtime");
const NODE_VERSION = process.env.NODE_RUNTIME_VERSION ?? "22.19.0";
const VERSION_FILE = ".node-version";

function nodeExecutableName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function stagedNodePath() {
  return path.join(dest, nodeExecutableName());
}

function isStaged() {
  if (!existsSync(stagedNodePath())) {
    return false;
  }
  const versionPath = path.join(dest, VERSION_FILE);
  if (!existsSync(versionPath)) {
    return false;
  }
  return readFileSync(versionPath, "utf8").trim() === NODE_VERSION;
}

function platformArch() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { platform: process.platform, arch };
}

function downloadUrl(version) {
  const { platform, arch } = platformArch();
  if (platform === "darwin") {
    return {
      url: `https://nodejs.org/dist/v${version}/node-v${version}-darwin-${arch}.tar.gz`,
      archive: "tar.gz",
      folder: `node-v${version}-darwin-${arch}`,
    };
  }
  if (platform === "linux") {
    return {
      url: `https://nodejs.org/dist/v${version}/node-v${version}-linux-${arch}.tar.xz`,
      archive: "tar.xz",
      folder: `node-v${version}-linux-${arch}`,
    };
  }
  if (platform === "win32") {
    return {
      url: `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`,
      archive: "zip",
      folder: `node-v${version}-win-x64`,
    };
  }
  throw new Error(`[stage-node-runtime] Unsupported platform: ${platform}`);
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[stage-node-runtime] Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(filePath));
}

function extractArchive(archivePath, archiveType, extractDir) {
  mkdirSync(extractDir, { recursive: true });
  if (archiveType === "zip") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return;
  }

  const tarArgs =
    archiveType === "tar.xz"
      ? ["-xJf", archivePath, "-C", extractDir]
      : ["-xzf", archivePath, "-C", extractDir];
  const result = spawnSync("tar", tarArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function stageNodeRuntime() {
  if (isStaged()) {
    console.log(`[stage-node-runtime] Reusing ${stagedNodePath()} (v${NODE_VERSION})`);
    return;
  }

  const { url, archive, folder } = downloadUrl(NODE_VERSION);
  const extractRoot = path.join(tmpdir(), `openharness-node-${NODE_VERSION}-${Date.now()}`);
  const archivePath = path.join(extractRoot, `node.${archive}`);

  mkdirSync(extractRoot, { recursive: true });
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });

  console.log(`[stage-node-runtime] Downloading Node ${NODE_VERSION} from ${url}`);
  await downloadFile(url, archivePath);
  extractArchive(archivePath, archive, extractRoot);

  const extractedNode =
    process.platform === "win32"
      ? path.join(extractRoot, folder, "node.exe")
      : path.join(extractRoot, folder, "bin", "node");

  if (!existsSync(extractedNode)) {
    console.error(`[stage-node-runtime] Missing extracted Node binary: ${extractedNode}`);
    process.exit(1);
  }

  cpSync(extractedNode, stagedNodePath());
  if (process.platform !== "win32") {
    chmodSync(stagedNodePath(), 0o755);
  }
  writeFileSync(path.join(dest, VERSION_FILE), `${NODE_VERSION}\n`, "utf8");

  rmSync(extractRoot, { recursive: true, force: true });
  console.log(`[stage-node-runtime] Wrote ${stagedNodePath()}`);
}

await stageNodeRuntime();
