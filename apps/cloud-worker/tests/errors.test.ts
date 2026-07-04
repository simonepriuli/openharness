import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApiUnreachableError,
  ClaimConflictError,
  CloudRunFailedError,
  CloudWorkerInfrastructureError,
  ConfigError,
  ExtensionEnvError,
  IterationCapError,
  MissingConnectionError,
  SandboxStopError,
} from "../src/errors.js";

describe("TaggedError classes", () => {
  it("builds config and cli errors", () => {
    assert.equal(new ConfigError({ field: "X" }).message, "X is required");
    assert.equal(new ConfigError({ field: "X" }).field, "X");
  });

  it("builds api unreachable errors from Error and non-Error causes", () => {
    const fromError = new ApiUnreachableError({
      apiUrl: "http://localhost:3001",
      cause: new Error("down"),
    });
    assert.match(fromError.message, /down/);

    const fromString = new ApiUnreachableError({
      apiUrl: "http://localhost:3001",
      cause: "offline",
    });
    assert.match(fromString.message, /offline/);

    const unknown = new ApiUnreachableError({
      apiUrl: "http://localhost:3001",
      cause: undefined,
    });
    assert.match(unknown.message, /unknown error/);
  });

  it("builds run lifecycle errors", () => {
    const claim = new ClaimConflictError({ runId: "run-1" });
    assert.ok(ClaimConflictError.is(claim));

    const missing = new MissingConnectionError({ runId: "run-1", context: "test" });
    assert.match(missing.message, /for test/);

    const missingDefault = new MissingConnectionError({ runId: "run-1" });
    assert.match(missingDefault.message, /Missing project source control connection$/);

    const cap = new IterationCapError({ runId: "run-1", cap: 3 });
    assert.match(cap.message, /3/);
  });

  it("builds execution and infrastructure errors", () => {
    const failed = new CloudRunFailedError({ runId: "run-1", cause: new Error("boom") });
    assert.equal(failed.message, "boom");

    const failedString = new CloudRunFailedError({ runId: "run-1", cause: "bad" });
    assert.equal(failedString.message, "bad");

    const infra = new CloudWorkerInfrastructureError({
      operation: "fetch",
      cause: new Error("network"),
    });
    assert.match(infra.message, /fetch failed/);

    const infraString = new CloudWorkerInfrastructureError({
      operation: "fetch",
      cause: "offline",
    });
    assert.match(infraString.message, /offline/);
  });

  it("builds sandbox and extension errors", () => {
    const sandbox = new SandboxStopError({
      sandboxName: "sb-1",
      cause: new Error("stop failed"),
    });
    assert.match(sandbox.message, /sb-1/);

    const sandboxString = new SandboxStopError({ sandboxName: "sb-1", cause: "nope" });
    assert.match(sandboxString.message, /nope/);

    const extension = new ExtensionEnvError({
      extension: "github-actions",
      cause: new Error("disk"),
    });
    assert.match(extension.message, /github-actions/);

    const extensionString = new ExtensionEnvError({
      extension: "linear-actions",
      cause: "disk",
    });
    assert.match(extensionString.message, /linear-actions/);
  });
});
