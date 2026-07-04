import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueSandboxName, runSandboxName } from "./sandbox-names.js";

describe("issueSandboxName", () => {
  it("is stable for the same org and issue", () => {
    const first = issueSandboxName("org-1", "issue-abc");
    const second = issueSandboxName("org-1", "issue-abc");
    assert.equal(first, second);
  });

  it("changes when the issue id changes", () => {
    const first = issueSandboxName("org-1", "issue-abc");
    const second = issueSandboxName("org-1", "issue-def");
    assert.notEqual(first, second);
  });

  it("stays within Vercel sandbox name limits", () => {
    const name = issueSandboxName("org-with-a-very-long-name", "issue-with-a-very-long-id");
    assert.ok(name.length <= 128);
    assert.match(name, /^openharness-agent-issue-/);
  });
});

describe("runSandboxName", () => {
  it("names forked run sandboxes deterministically per run id", () => {
    assert.equal(runSandboxName("run-1"), "openharness-run-run-1");
  });
});
