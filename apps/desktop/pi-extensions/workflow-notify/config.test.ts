import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readWorkflowNotifyConfig } from "./config.js";

describe("readWorkflowNotifyConfig", () => {
  const originalEnv = { ...process.env };

  it("accepts session auth without kind", () => {
    process.env.OPENHARNESS_WORKFLOW_RUN_ID = "run-1";
    process.env.OPENHARNESS_ENABLED_NOTIFY_TOOLS = "post_discord_message";
    process.env.OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE = new URL(
      "../github-actions/fixtures/session-auth.json",
      import.meta.url,
    ).pathname;

    const config = readWorkflowNotifyConfig();
    assert.ok(config);
    assert.equal(config?.runId, "run-1");
    assert.ok(config?.enabledTools.has("post_discord_message"));
    if (config?.auth.kind !== "cloud_worker") {
      assert.equal(config.auth.cookie, "session=abc");
    }

    process.env = { ...originalEnv };
  });

  it("accepts cloud_worker auth shape", () => {
    process.env.OPENHARNESS_WORKFLOW_RUN_ID = "run-2";
    process.env.OPENHARNESS_ENABLED_NOTIFY_TOOLS = "post_teams_message";
    process.env.OPENHARNESS_WORKFLOW_NOTIFY_AUTH_FILE = new URL(
      "../github-actions/fixtures/cloud-worker-auth.json",
      import.meta.url,
    ).pathname;

    const config = readWorkflowNotifyConfig();
    assert.ok(config);
    assert.equal(config?.auth.kind, "cloud_worker");
    assert.ok(config?.enabledTools.has("post_teams_message"));

    process.env = { ...originalEnv };
  });
});
