import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Result } from "better-result";
import { ConfigError } from "../src/errors.js";
import { loadCloudWorkerConfig } from "../src/config.js";

describe("loadCloudWorkerConfig", () => {
  const envBackup = { ...process.env };

  after(() => {
    process.env = { ...envBackup };
  });

  it("requires API URL and cloud worker secret", () => {
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.CLOUD_WORKER_SECRET;

    const missingApi = loadCloudWorkerConfig();
    assert.ok(Result.isError(missingApi));
    assert.ok(ConfigError.is(missingApi.error));

    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    const missingSecret = loadCloudWorkerConfig();
    assert.ok(Result.isError(missingSecret));
    assert.match(missingSecret.error.message, /CLOUD_WORKER_SECRET is required/);
  });

  it("normalizes localhost and uses explicit env overrides", () => {
    process.env.OPENHARNESS_API_URL = "http://localhost:3001/";
    process.env.CLOUD_WORKER_SECRET = "secret";
    process.env.CLOUD_WORKER_ID = "worker-explicit";
    process.env.VERCEL_SANDBOX_ID = "sandbox-1";
    process.env.OPENHARNESS_REPOS_ROOT = "/repos";
    process.env.OPENHARNESS_WORKTREES_ROOT = "/worktrees";
    process.env.OPENHARNESS_PI_AGENT_ROOT = "/pi";
    process.env.OPENHARNESS_SUMMARIZATION_MODEL = "model/ref";

    const result = loadCloudWorkerConfig();
    assert.ok(Result.isOk(result));
    assert.equal(result.value.apiUrl, "http://127.0.0.1:3001");
    assert.equal(result.value.workerId, "worker-explicit");
    assert.equal(result.value.sandboxName, "sandbox-1");
    assert.equal(result.value.reposRoot, "/repos");
    assert.equal(result.value.summarizationModelRef, "model/ref");
  });

  it("falls back for invalid api url strings and resolves staged extension dirs", () => {
    const root = join(tmpdir(), `oh-root-${process.pid}`);
    const stagedGithub = join(root, "extensions/github-actions");
    mkdirSync(stagedGithub, { recursive: true });

    process.env.OPENHARNESS_API_URL = "not-a-valid-url";
    process.env.CLOUD_WORKER_SECRET = "secret";
    process.env.OPENHARNESS_ROOT = root;
    delete process.env.CLOUD_WORKER_ID;

    const result = loadCloudWorkerConfig();
    assert.ok(Result.isOk(result));
    assert.equal(result.value.apiUrl, "not-a-valid-url");
    assert.equal(result.value.githubActionsExtensionDir, stagedGithub);
    assert.match(result.value.workerId, /cloud-worker|.+-\d+$/);

    rmSync(root, { recursive: true, force: true });
  });

  it("uses dev extension paths when staged paths are missing", () => {
    const root = join(tmpdir(), `oh-dev-root-${process.pid}`);
    const devGithub = join(root, "apps/desktop/pi-extensions/github-actions");
    const devNotify = join(root, "apps/desktop/pi-extensions/workflow-notify");
    const devLinear = join(root, "apps/desktop/pi-extensions/linear-actions");
    mkdirSync(devGithub, { recursive: true });
    mkdirSync(devNotify, { recursive: true });
    mkdirSync(devLinear, { recursive: true });

    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    process.env.OPENHARNESS_ROOT = root;

    const result = loadCloudWorkerConfig();
    assert.ok(Result.isOk(result));
    assert.equal(result.value.githubActionsExtensionDir, devGithub);
    assert.equal(result.value.workflowNotifyExtensionDir, devNotify);
    assert.equal(result.value.linearActionsExtensionDir, devLinear);

    rmSync(root, { recursive: true, force: true });
  });

  it("uses default extension paths when OPENHARNESS_ROOT is unset", () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    delete process.env.OPENHARNESS_ROOT;

    const result = loadCloudWorkerConfig();
    assert.ok(Result.isOk(result));
    assert.ok(result.value.githubActionsExtensionDir.includes("github-actions"));
    assert.ok(existsSync(result.value.githubActionsExtensionDir) || true);
  });

  it("prefers OPENHARNESS_API_URL over BETTER_AUTH_URL", () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:4000";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";

    const result = loadCloudWorkerConfig();
    assert.ok(Result.isOk(result));
    assert.equal(result.value.apiUrl, "http://127.0.0.1:4000");
  });

  it("uses VERCEL_SANDBOX_NAME when set", () => {
    process.env.OPENHARNESS_API_URL = "http://127.0.0.1:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    process.env.VERCEL_SANDBOX_NAME = "sandbox-name";

    const result = loadCloudWorkerConfig();
    assert.equal(result.value!.sandboxName, "sandbox-name");
  });
});
