import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BatchTooLargeError,
  RunNotActiveError,
  RunNotFoundError,
} from "../errors.js";
import { mapRunEventsError } from "../result-helpers.js";

describe("session workflow run events", () => {
  it("maps append errors to HTTP status codes", () => {
    const cases = [
      { error: new RunNotFoundError({ message: "test" }), status: 404 },
      { error: new RunNotActiveError({ message: "test" }), status: 409 },
      { error: new BatchTooLargeError({ message: "test" }), status: 400 },
    ] as const;

    for (const { error, status } of cases) {
      assert.equal(mapRunEventsError(error).status, status);
    }
  });
});
