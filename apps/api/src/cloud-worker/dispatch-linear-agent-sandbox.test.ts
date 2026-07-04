import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueSandboxName } from "./sandbox-names.js";

describe("dispatchCloudLinearAgentRun workspace contract", () => {
  it("passes workspace env flags for issue reuse", () => {
    const workerEnv = {
      OPENHARNESS_WORKSPACE_MODE: "reuse",
      OPENHARNESS_LINEAR_ISSUE_ID: "issue-1",
      VERCEL_SANDBOX_NAME: issueSandboxName("org-1", "issue-1"),
    };
    assert.equal(workerEnv.OPENHARNESS_WORKSPACE_MODE, "reuse");
    assert.equal(workerEnv.OPENHARNESS_LINEAR_ISSUE_ID, "issue-1");
    assert.match(workerEnv.VERCEL_SANDBOX_NAME, /^openharness-agent-issue-/);
  });

  it("uses cold mode when concurrent runs block reuse", () => {
    const workerEnv = {
      OPENHARNESS_WORKSPACE_MODE: "cold",
      RUN_ID: "run-1",
    };
    assert.equal(workerEnv.OPENHARNESS_WORKSPACE_MODE, "cold");
    assert.equal("OPENHARNESS_LINEAR_ISSUE_ID" in workerEnv, false);
  });
});
