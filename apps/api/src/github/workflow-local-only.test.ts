import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canMutateWorkflow, canViewWorkflow } from "./workflow-db.js";

describe("canViewWorkflow", () => {
  it("allows org-wide workflows for any viewer", () => {
    assert.equal(
      canViewWorkflow({ localOnly: false, userId: "creator" }, "other-user"),
      true,
    );
  });

  it("allows local workflows only for the creator", () => {
    assert.equal(canViewWorkflow({ localOnly: true, userId: "creator" }, "creator"), true);
    assert.equal(canViewWorkflow({ localOnly: true, userId: "creator" }, "other-user"), false);
  });
});

describe("canMutateWorkflow", () => {
  it("allows any org member to mutate org-wide workflows", () => {
    assert.equal(
      canMutateWorkflow({ localOnly: false, userId: "creator" }, "other-user"),
      true,
    );
  });

  it("allows only the creator to mutate local workflows", () => {
    assert.equal(canMutateWorkflow({ localOnly: true, userId: "creator" }, "creator"), true);
    assert.equal(canMutateWorkflow({ localOnly: true, userId: "creator" }, "other-user"), false);
  });
});

describe("local workflow pending filter predicate", () => {
  it("documents the visibility rule for pending runs", () => {
    const cases = [
      { workflowId: null, localOnly: false, workflowUserId: "a", runnerUserId: "b", visible: true },
      { workflowId: "wf", localOnly: false, workflowUserId: "a", runnerUserId: "b", visible: true },
      { workflowId: "wf", localOnly: true, workflowUserId: "a", runnerUserId: "a", visible: true },
      { workflowId: "wf", localOnly: true, workflowUserId: "a", runnerUserId: "b", visible: false },
    ] as const;

    for (const row of cases) {
      const visible =
        row.workflowId === null ||
        !row.localOnly ||
        row.workflowUserId === row.runnerUserId;
      assert.equal(visible, row.visible, JSON.stringify(row));
    }
  });
});
