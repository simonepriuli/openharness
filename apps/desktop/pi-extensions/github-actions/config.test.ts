import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readGithubActionsConfig } from "./config.js";

describe("readGithubActionsConfig", () => {
  const originalEnv = { ...process.env };

  it("accepts session auth without kind", () => {
    process.env.OPENHARNESS_SC_NAMESPACE = "acme";
    process.env.OPENHARNESS_SC_REPO = "demo";
    process.env.OPENHARNESS_ENABLED_GITHUB_TOOLS = "approve_pull_request";
    process.env.OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE = new URL(
      "./fixtures/session-auth.json",
      import.meta.url,
    ).pathname;

    const config = readGithubActionsConfig();
    assert.ok(config);
    assert.equal(config?.auth.kind, undefined);
    if (config?.auth.kind !== "cloud_worker") {
      assert.equal(config.auth.cookie, "session=abc");
    }

    process.env = { ...originalEnv };
  });

  it("accepts cloud_worker auth shape", () => {
    process.env.OPENHARNESS_SC_NAMESPACE = "acme";
    process.env.OPENHARNESS_SC_REPO = "demo";
    process.env.OPENHARNESS_ENABLED_GITHUB_TOOLS = "approve_pull_request";
    process.env.OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE = new URL(
      "./fixtures/cloud-worker-auth.json",
      import.meta.url,
    ).pathname;

    const config = readGithubActionsConfig();
    assert.ok(config);
    assert.equal(config?.auth.kind, "cloud_worker");

    process.env = { ...originalEnv };
  });
});
