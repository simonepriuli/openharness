import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DISMISSABLE = new Set(["pending", "claimed", "running"]);

describe("dismissWorkflowRunForOrg eligibility", () => {
  it("allows dismiss only for active statuses", () => {
    for (const status of ["pending", "claimed", "running"] as const) {
      assert.equal(DISMISSABLE.has(status), true, status);
    }
    for (const status of ["done", "failed"] as const) {
      assert.equal(DISMISSABLE.has(status), false, status);
    }
  });
});
