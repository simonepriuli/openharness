import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkflowRunEventsError } from "./workflow-run-events-db.js";

describe("workflow run events errors", () => {
  it("exposes stable error codes", () => {
    const err = new WorkflowRunEventsError("RUN_NOT_ACTIVE", "Workflow run is not accepting events");
    assert.equal(err.code, "RUN_NOT_ACTIVE");
    assert.equal(err.message, "Workflow run is not accepting events");
  });
});
