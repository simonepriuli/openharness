import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { loadCloudWorkerConfig } from "./config.js";

describe("loadCloudWorkerConfig", () => {
  const envBackup = { ...process.env };

  after(() => {
    process.env = { ...envBackup };
  });

  it("requires API URL and cloud worker secret", () => {
    delete process.env.OPENHARNESS_API_URL;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.CLOUD_WORKER_SECRET;
    assert.throws(() => loadCloudWorkerConfig(), /OPENHARNESS_API_URL is required/);

    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    assert.throws(() => loadCloudWorkerConfig(), /CLOUD_WORKER_SECRET is required/);
  });

  it("falls back to BETTER_AUTH_URL and normalizes localhost to 127.0.0.1", () => {
    process.env.BETTER_AUTH_URL = "http://localhost:3001/";
    process.env.CLOUD_WORKER_SECRET = "secret";
    delete process.env.OPENHARNESS_API_URL;

    const config = loadCloudWorkerConfig();
    assert.equal(config.apiUrl, "http://127.0.0.1:3001");
  });

  it("loads defaults when required env vars are set", () => {
    process.env.OPENHARNESS_API_URL = "http://localhost:3001";
    process.env.CLOUD_WORKER_SECRET = "secret";
    delete process.env.BETTER_AUTH_URL;
    delete process.env.CLOUD_WORKER_ID;

    const config = loadCloudWorkerConfig();
    assert.equal(config.apiUrl, "http://127.0.0.1:3001");
    assert.equal(config.secret, "secret");
    assert.match(config.workerId, /cloud-worker|.+-\d+$/);
    assert.equal(config.reposRoot, "/tmp/openharness/repos");
    assert.equal(config.worktreesRoot, "/tmp/openharness/worktrees");
  });
});
