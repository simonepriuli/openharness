import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linearAgentSessionIdFromRun } from "./linear-agent-activities.js";

describe("linearAgentSessionIdFromRun", () => {
  it("reads linearAgentSessionId from run payload", () => {
    assert.equal(
      linearAgentSessionIdFromRun({
        id: "run-1",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        mappingId: null,
        projectSourceControlConnectionId: null,
        connectionId: null,
        provider: "github",
        namespace: "acme",
        repoName: "app",
        trigger: "delegated",
        linearIssueId: null,
        deliveryId: "delivery-1",
        status: "running",
        claimedBy: null,
        runnerKind: null,
        payload: { linearAgentSessionId: "linear-sess-1" },
        errorMessage: null,
        resultMarkdown: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "linear-sess-1",
    );
  });

  it("returns null when session id is missing", () => {
    assert.equal(
      linearAgentSessionIdFromRun({
        id: "run-1",
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        mappingId: null,
        projectSourceControlConnectionId: null,
        connectionId: null,
        provider: "github",
        namespace: "acme",
        repoName: "app",
        trigger: "delegated",
        linearIssueId: null,
        deliveryId: "delivery-1",
        status: "running",
        claimedBy: null,
        runnerKind: null,
        payload: {},
        errorMessage: null,
        resultMarkdown: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      null,
    );
  });
});

describe("linear agent status handler milestones", () => {
  it("does not emit preparing or running milestones on status=running", () => {
    const routesSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../cloud-worker/linear-agent-internal-routes.ts"),
      "utf8",
    );
    assert.doesNotMatch(routesSource, /if \(status === "running"\)/);
    assert.match(routesSource, /status === "done"/);
  });
});
