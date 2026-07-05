import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import {
  BatchTooLargeError,
  ClaimConflictError,
  NotifyError,
  RunNotActiveError,
  RunNotFoundError,
} from "./errors.js";
import {
  errorMessage,
  mapRunEventsError,
  runEventsErrorCode,
  tryPromiseAllowFailure,
  wrapClaimResult,
} from "./result-helpers.js";

describe("mapRunEventsError", () => {
  it("maps run event errors to HTTP status codes", () => {
    const cases = [
      { error: new RunNotFoundError({ message: "missing" }), status: 404, code: "RUN_NOT_FOUND" },
      {
        error: new RunNotActiveError({ message: "inactive" }),
        status: 409,
        code: "RUN_NOT_ACTIVE",
      },
      {
        error: new BatchTooLargeError({ message: "too many" }),
        status: 400,
        code: "BATCH_TOO_LARGE",
      },
    ] as const;

    for (const { error, status, code } of cases) {
      const mapped = mapRunEventsError(error);
      assert.equal(mapped.status, status);
      assert.equal(mapped.code, code);
    }
  });
});

describe("runEventsErrorCode", () => {
  it("returns stable error codes for tagged errors", () => {
    assert.equal(
      runEventsErrorCode(new RunNotActiveError({ message: "Workflow run is not accepting events" })),
      "RUN_NOT_ACTIVE",
    );
  });
});

describe("wrapClaimResult", () => {
  it("wraps missing runs as claim conflicts", () => {
    const result = wrapClaimResult("run-1", null);
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.equal(ClaimConflictError.is(result.error), true);
      assert.match(result.error.message, /not available/i);
    }
  });

  it("returns ok when a run is present", () => {
    const run = { id: "run-1" };
    const result = wrapClaimResult("run-1", run);
    assert.equal(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assert.deepEqual(result.value, run);
    }
  });
});

describe("tryPromiseAllowFailure", () => {
  it("returns ok for successful async work", async () => {
    const result = await tryPromiseAllowFailure(async () => "value");
    assert.equal(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assert.equal(result.value, "value");
    }
  });

  it("returns err with the caught cause", async () => {
    const result = await tryPromiseAllowFailure(async () => {
      throw new Error("boom");
    });
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.equal(errorMessage(result.error), "boom");
    }
  });
});

describe("NotifyError", () => {
  it("carries HTTP status for notify failures", () => {
    const error = new NotifyError({ status: 503, message: "Discord bot is not configured" });
    assert.equal(error.status, 503);
    assert.equal(error.message, "Discord bot is not configured");
  });
});
