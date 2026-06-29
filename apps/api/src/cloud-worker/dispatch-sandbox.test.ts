import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSandboxName } from "./sandbox-names.js";
import { SANDBOX_BUNDLE_ROOT, SANDBOX_INITIAL_TIMEOUT_MS } from "./sandbox-dispatch-env.js";

describe("dispatch sandbox constants", () => {
  it("uses the staged bundle root inside the VM", () => {
    assert.equal(SANDBOX_BUNDLE_ROOT, "/vercel/sandbox/openharness");
  });

  it("starts with a 15 minute timeout", () => {
    assert.equal(SANDBOX_INITIAL_TIMEOUT_MS, 15 * 60 * 1000);
  });
});

describe("dispatchCloudWorkflowRun contract", () => {
  it("documents the detached run-once command shape", () => {
    const command = {
      cmd: "node",
      args: [
        "cloud-worker/dist/index.js",
        "run-once",
        "--run-id",
        "run-1",
        "--organization-id",
        "org-1",
      ],
      cwd: SANDBOX_BUNDLE_ROOT,
      detached: true,
    };
    assert.equal(command.cwd, "/vercel/sandbox/openharness");
    assert.equal(command.detached, true);
  });

  it("names forked run sandboxes deterministically per run id", () => {
    assert.equal(runSandboxName("run-1"), "openharness-run-run-1");
  });
});
