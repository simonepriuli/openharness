import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ConfigError, CloudWorkerInfrastructureError } from "../src/errors.js";
import { logFatalAndExit, wrapInfrastructureError } from "../src/result-helpers.js";

describe("result helper edge cases", () => {
  it("wraps infrastructure errors", () => {
    const error = wrapInfrastructureError("test-op", new Error("boom"));
    assert.ok(CloudWorkerInfrastructureError.is(error));
    assert.equal(error.operation, "test-op");
  });

  it("logs fatal startup errors and exits", () => {
    const exit = mock.method(process, "exit", () => undefined as never);
    const errorLog = mock.method(console, "error", () => undefined);
    logFatalAndExit(new ConfigError({ field: "OPENHARNESS_API_URL" }));
    assert.ok(errorLog.mock.calls.length > 0);
    assert.equal(exit.mock.calls[0]?.arguments[0], 1);
    exit.mock.restore();
    errorLog.mock.restore();
  });
});
