import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { env } from "../env.js";

describe("linearAgentIssueWorkspaceIdleTtlMs", () => {
  const original = process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES;
    } else {
      process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES = original;
    }
  });

  it("defaults to 45 minutes", () => {
    delete process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES;
    assert.equal(env.linearAgentIssueWorkspaceIdleTtlMs(), 45 * 60 * 1000);
  });

  it("reads configured minutes within 30–120", () => {
    process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES = "60";
    assert.equal(env.linearAgentIssueWorkspaceIdleTtlMs(), 60 * 60 * 1000);
  });

  it("falls back to default for out-of-range values", () => {
    process.env.LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES = "10";
    assert.equal(env.linearAgentIssueWorkspaceIdleTtlMs(), 45 * 60 * 1000);
  });
});
