import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isWorkflowExecutionTarget,
  isWorkflowRunnerKind,
} from "./workflow-execution.js";

describe("workflow execution type guards", () => {
  it("validates execution targets", () => {
    assert.equal(isWorkflowExecutionTarget("auto"), true);
    assert.equal(isWorkflowExecutionTarget("invalid"), false);
  });

  it("validates runner kinds", () => {
    assert.equal(isWorkflowRunnerKind("cloud"), true);
    assert.equal(isWorkflowRunnerKind("server"), false);
  });
});
