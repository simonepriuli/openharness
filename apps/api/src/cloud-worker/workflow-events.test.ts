import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RunNotActiveError } from "../errors.js";
import { mapRunEventsError, runEventsErrorCode } from "../result-helpers.js";

describe("workflow run events errors", () => {
  it("exposes stable error codes", () => {
    const err = new RunNotActiveError({ message: "Workflow run is not accepting events" });
    assert.equal(runEventsErrorCode(err), "RUN_NOT_ACTIVE");
    assert.equal(err.message, "Workflow run is not accepting events");
    assert.equal(mapRunEventsError(err).status, 409);
  });
});
