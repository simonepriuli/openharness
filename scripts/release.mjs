#!/usr/bin/env node
/**
 * Bump version from the latest v* tag, commit, tag, and push to trigger Release CI.
 *
 * Usage:
 *   node scripts/release.mjs patch   # 0.1.0 -> 0.1.1
 *   node scripts/release.mjs minor   # 0.1.0 -> 0.2.0
 *   node scripts/release.mjs major   # 0.1.0 -> 1.0.0
 *   node scripts/release.mjs --dry-run patch
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DESKTOP_PKG = "apps/desktop/package.json";
const BUMP_TYPES = new Set(["patch", "minor", "major"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpType = args.find((arg) => arg !== "--dry-run");

if (!bumpType || !BUMP_TYPES.has(bumpType)) {
  console.error("Usage: node scripts/release.mjs [--dry-run] <patch|minor|major>");
  process.exit(1);
}

function run(cmd, options = {}) {
  console.log(`$ ${cmd}`);
  if (dryRun && !options.readonly) return "";
  return execSync(cmd, { encoding: "utf8", stdio: options.silent ? "pipe" : "inherit" });
}

function latestTaggedVersion() {
  const output = run('git tag -l "v*" --sort=-v:refname', { silent: true, readonly: true });
  const latest = output.trim().split("\n").find(Boolean);
  if (!latest) return "0.0.0";
  return latest.replace(/^v/, "");
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    console.error(`Invalid version: ${version}`);
    process.exit(1);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, type) {
  const v = parseVersion(current);
  if (type === "major") {
    return `${v.major + 1}.0.0`;
  }
  if (type === "minor") {
    return `${v.major}.${v.minor + 1}.0`;
  }
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function assertCleanTree() {
  const status = run("git status --porcelain", { silent: true, readonly: true }).trim();
  if (status) {
    console.error("Working tree is not clean. Commit or stash changes before releasing.");
    process.exit(1);
  }
}

function assertOnMain() {
  const branch = run("git branch --show-current", { silent: true, readonly: true }).trim();
  if (branch !== "main") {
    console.error(`Releases must be cut from main (current branch: ${branch || "detached"}).`);
    process.exit(1);
  }
}

function updateDesktopPackageVersion(version) {
  const path = join(process.cwd(), DESKTOP_PKG);
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

const current = latestTaggedVersion();
const next = bumpVersion(current, bumpType);
const tag = `v${next}`;

console.log(`Release ${bumpType}: ${current} -> ${next} (${tag})`);

assertCleanTree();
assertOnMain();

if (!dryRun) {
  updateDesktopPackageVersion(next);
  run(`git add ${DESKTOP_PKG}`);
  run(`git commit -m "Release ${tag}"`);
  run(`git tag ${tag}`);
  run("git push origin main");
  run(`git push origin ${tag}`);
}

console.log(dryRun ? "Dry run complete." : `Released ${tag}. GitHub Actions will build and publish installers.`);
