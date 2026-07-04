import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Result } from "better-result";
import {
  ApiUnreachableError,
  ClaimConflictError,
  CloudRunFailedError,
  ConfigError,
} from "../src/errors.js";
import {
  cloudRunResultToExitCode,
  infrastructureResultToExitCode,
  logFatalAndExit,
  parseClaimConflict,
  wrapInfrastructureError,
} from "../src/result-helpers.js";

describe("result-helpers", () => {
  it("parses claim conflicts including not available messages", () => {
    const conflict = parseClaimConflict(new Error("Run not available (409)"), "run-1");
    assert.ok(conflict);
    assert.ok(ClaimConflictError.is(conflict));

    assert.equal(parseClaimConflict(new Error("not available"), "run-1")?.runId, "run-1");
    assert.equal(parseClaimConflict("not available", "run-1")?.runId, "run-1");
    assert.equal(parseClaimConflict(new Error("network down"), "run-1"), null);
  });

  it("maps cloud run results to exit codes", () => {
    assert.equal(cloudRunResultToExitCode(Result.ok(undefined)), 0);
    assert.equal(
      cloudRunResultToExitCode(Result.err(new ClaimConflictError({ runId: "run-1" }))),
      0,
    );
    assert.equal(
      cloudRunResultToExitCode(
        Result.err(new CloudRunFailedError({ runId: "run-1", cause: new Error("boom") })),
      ),
      1,
    );
  });

  it("maps infrastructure results to exit codes", () => {
    assert.equal(
      infrastructureResultToExitCode(
        Result.err(new CloudRunFailedError({ runId: "run-1", cause: new Error("boom") })),
      ),
      1,
    );
    assert.equal(
      infrastructureResultToExitCode(Result.err(new ClaimConflictError({ runId: "run-1" }))),
      0,
    );
  });

  it("wraps infrastructure errors", () => {
    const wrapped = wrapInfrastructureError("op", new Error("x"));
    assert.match(wrapped.message, /op failed/);
  });

  it("logs fatal startup errors and exits", () => {
    const exit = mock.method(process, "exit", () => undefined as never);
    const errorLog = mock.method(console, "error", () => undefined);

    logFatalAndExit(new ConfigError({ field: "X" }));
    assert.equal(exit.mock.calls.length, 1);
    assert.match(String(errorLog.mock.calls[0]?.arguments[0]), /X is required/);

    exit.mock.restore();
    errorLog.mock.restore();

    const exit2 = mock.method(process, "exit", () => undefined as never);
    logFatalAndExit(
      new ApiUnreachableError({ apiUrl: "http://localhost:3001", cause: new Error("down") }),
    );
    assert.equal(exit2.mock.calls.length, 1);
    exit2.mock.restore();
  });
});
