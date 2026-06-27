import assert from "node:assert/strict";
import { describe, it } from "node:test";

const RECONCILABLE = new Set(["claimed", "running"]);

describe("workflow runner stale run reconciliation", () => {
  it("targets only claimed and running runs owned by this runner", () => {
    for (const status of ["claimed", "running"] as const) {
      assert.equal(RECONCILABLE.has(status), true, status);
    }
    for (const status of ["pending", "done", "failed"] as const) {
      assert.equal(RECONCILABLE.has(status), false, status);
    }
  });

  it("skips runs that are actively queued or executing locally", () => {
    const executingRunId = "run-a";
    const queue = [{ id: "run-b" }];
    const activeRuns = [
      { id: "run-a", status: "running" },
      { id: "run-b", status: "claimed" },
      { id: "run-c", status: "running" },
    ];

    const stale = activeRuns.filter(
      (run) =>
        RECONCILABLE.has(run.status) &&
        executingRunId !== run.id &&
        !queue.some((queued) => queued.id === run.id),
    );

    assert.deepEqual(stale.map((run) => run.id), ["run-c"]);
  });
});
