import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferLinearAgentWorkspaceModeFromRecord,
  isIssueWorkspaceCompatible,
  isIssueWorkspaceExpired,
  type LinearAgentIssueWorkspaceRecord,
} from "./linear-agent-issue-workspace-db.js";

function workspace(
  overrides: Partial<LinearAgentIssueWorkspaceRecord> = {},
): LinearAgentIssueWorkspaceRecord {
  return {
    id: "ws-1",
    organizationId: "org-1",
    linearIssueId: "issue-1",
    projectSourceControlConnectionId: "conn-1",
    bundleFingerprint: "fp-1",
    sandboxName: "sandbox-1",
    status: "ready",
    worktreePath: "/tmp/worktree",
    workBranch: "openharness/branch-main",
    piAgentDir: "/tmp/pi",
    piSessionPath: "/tmp/pi/session.json",
    lastCompletedRunId: "run-1",
    lastActiveAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isIssueWorkspaceCompatible", () => {
  it("matches connection and bundle fingerprint", () => {
    assert.equal(
      isIssueWorkspaceCompatible(workspace(), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-1",
      }),
      true,
    );
  });

  it("rejects bundle fingerprint mismatch", () => {
    assert.equal(
      isIssueWorkspaceCompatible(workspace(), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-2",
      }),
      false,
    );
  });

  it("rejects connection mismatch", () => {
    assert.equal(
      isIssueWorkspaceCompatible(workspace(), {
        projectSourceControlConnectionId: "conn-2",
        bundleFingerprint: "fp-1",
      }),
      false,
    );
  });
});

describe("isIssueWorkspaceExpired", () => {
  it("treats expired status as expired", () => {
    assert.equal(isIssueWorkspaceExpired(workspace({ status: "expired" })), true);
  });

  it("treats past expiresAt as expired", () => {
    assert.equal(
      isIssueWorkspaceExpired(
        workspace({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
      ),
      true,
    );
  });

  it("treats future expiresAt as active", () => {
    assert.equal(
      isIssueWorkspaceExpired(
        workspace({ expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      ),
      false,
    );
  });

  it("treats busy workspaces without expiresAt as active", () => {
    assert.equal(
      isIssueWorkspaceExpired(
        workspace({ status: "busy", expiresAt: null }),
      ),
      false,
    );
  });
});

describe("inferLinearAgentWorkspaceModeFromRecord", () => {
  it("returns cold when there is no issue id", () => {
    assert.equal(
      inferLinearAgentWorkspaceModeFromRecord(null, workspace(), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-1",
      }),
      "cold",
    );
  });

  it("returns create when no workspace exists yet", () => {
    assert.equal(
      inferLinearAgentWorkspaceModeFromRecord("issue-1", null, {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-1",
      }),
      "create",
    );
  });

  it("returns reuse for a ready workspace", () => {
    assert.equal(
      inferLinearAgentWorkspaceModeFromRecord("issue-1", workspace({ status: "ready" }), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-1",
      }),
      "reuse",
    );
  });

  it("returns cold when the workspace is still busy", () => {
    assert.equal(
      inferLinearAgentWorkspaceModeFromRecord("issue-1", workspace({ status: "busy" }), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-1",
      }),
      "cold",
    );
  });

  it("returns create when the bundle fingerprint changed", () => {
    assert.equal(
      inferLinearAgentWorkspaceModeFromRecord("issue-1", workspace(), {
        projectSourceControlConnectionId: "conn-1",
        bundleFingerprint: "fp-2",
      }),
      "create",
    );
  });
});
