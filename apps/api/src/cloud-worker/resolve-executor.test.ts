import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolveExecutor } from "./resolve-executor.js";

const originalSecret = process.env.CLOUD_WORKER_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CLOUD_WORKER_SECRET;
  } else {
    process.env.CLOUD_WORKER_SECRET = originalSecret;
  }
});

describe("resolveExecutor", () => {
  it("forces local when workflow is localOnly", () => {
    process.env.CLOUD_WORKER_SECRET = "test-secret";
    assert.equal(
      resolveExecutor({
        executionTarget: "cloud",
        localOnly: true,
        cloudWorkersEnabled: true,
      }),
      "local",
    );
  });

  it("honors explicit local target", () => {
    process.env.CLOUD_WORKER_SECRET = "test-secret";
    assert.equal(
      resolveExecutor({
        executionTarget: "local",
        localOnly: false,
        cloudWorkersEnabled: true,
      }),
      "local",
    );
  });

  it("prefers cloud when auto and gates pass", () => {
    process.env.CLOUD_WORKER_SECRET = "test-secret";
    assert.equal(
      resolveExecutor({
        executionTarget: "auto",
        localOnly: false,
        cloudWorkersEnabled: true,
      }),
      "cloud",
    );
  });

  it("falls back to local when cloud gates fail", () => {
    delete process.env.CLOUD_WORKER_SECRET;
    assert.equal(
      resolveExecutor({
        executionTarget: "cloud",
        localOnly: false,
        cloudWorkersEnabled: false,
      }),
      "local",
    );
  });
});
