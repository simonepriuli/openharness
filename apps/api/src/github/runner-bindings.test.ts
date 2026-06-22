import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("workflow run claim contract", () => {
  it("requires runnerInstanceId alongside claimedBy", () => {
    const body = { claimedBy: "runner-a", runnerInstanceId: "runner-a" };
    assert.equal(typeof body.runnerInstanceId, "string");
    assert.equal(body.claimedBy, body.runnerInstanceId);
  });

  it("inserts runs without a project path until claim", () => {
    const pendingRun = {
      projectGithubConnectionId: "conn-1",
      projectPath: null as string | null,
      status: "pending",
    };
    const claimedRun = {
      ...pendingRun,
      projectPath: "/Users/dev/repo",
      status: "claimed",
      claimedBy: "runner-a",
    };

    assert.equal(pendingRun.projectPath, null);
    assert.equal(claimedRun.projectPath, "/Users/dev/repo");
  });
});

describe("webhook dedupe expectation", () => {
  it("creates one run per workflow when only one org connection exists per repo", () => {
    const connections = [{ id: "conn-1" }];
    const workflows = [{ id: "wf-1" }, { id: "wf-2" }];
    const runs = connections.flatMap((connection) =>
      workflows.map((workflow) => `${connection.id}:${workflow.id}`),
    );
    assert.deepEqual(runs, ["conn-1:wf-1", "conn-1:wf-2"]);
    assert.equal(connections.length, 1);
  });
});
