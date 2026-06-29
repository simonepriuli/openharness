import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCloudWorkerAuthorized } from "./internal-auth.js";

describe("cloud worker internal auth", () => {
  const originalSecret = process.env.CLOUD_WORKER_SECRET;

  it("rejects missing bearer token", () => {
    delete process.env.CLOUD_WORKER_SECRET;
    assert.equal(isCloudWorkerAuthorized(undefined), false);
  });

  it("accepts matching bearer token", () => {
    process.env.CLOUD_WORKER_SECRET = "worker-secret";
    assert.equal(isCloudWorkerAuthorized("Bearer worker-secret"), true);
    assert.equal(isCloudWorkerAuthorized("Bearer wrong"), false);
    if (originalSecret === undefined) {
      delete process.env.CLOUD_WORKER_SECRET;
    } else {
      process.env.CLOUD_WORKER_SECRET = originalSecret;
    }
  });
});
