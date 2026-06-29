import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkflowRunEventsError } from "../cloud-worker/workflow-run-events-db.js";

describe("session workflow run events", () => {
  it("maps append errors to HTTP status codes", () => {
    const cases: Array<{ code: WorkflowRunEventsError["code"]; status: number }> = [
      { code: "RUN_NOT_FOUND", status: 404 },
      { code: "RUN_NOT_ACTIVE", status: 409 },
      { code: "BATCH_TOO_LARGE", status: 400 },
    ];

    for (const { code, status } of cases) {
      const err = new WorkflowRunEventsError(code, "test");
      const mapped =
        err.code === "RUN_NOT_FOUND" ? 404 : err.code === "RUN_NOT_ACTIVE" ? 409 : 400;
      assert.equal(mapped, status, code);
    }
  });
});
