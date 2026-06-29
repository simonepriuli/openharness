import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSandboxDispatchEnabled } from "./sandbox-dispatch-env.js";

describe("isSandboxDispatchEnabled", () => {
  const original = {
    vercel: process.env.VERCEL,
    snapshotId: process.env.CLOUD_WORKER_SNAPSHOT_ID,
    secret: process.env.CLOUD_WORKER_SECRET,
  };

  it("requires Vercel, snapshot id, and secret", () => {
    delete process.env.VERCEL;
    delete process.env.CLOUD_WORKER_SNAPSHOT_ID;
    delete process.env.CLOUD_WORKER_SECRET;
    assert.equal(isSandboxDispatchEnabled(), false);

    process.env.VERCEL = "1";
    process.env.CLOUD_WORKER_SNAPSHOT_ID = "snap_test";
    assert.equal(isSandboxDispatchEnabled(), false);

    process.env.CLOUD_WORKER_SECRET = "secret";
    assert.equal(isSandboxDispatchEnabled(), true);

    process.env.VERCEL = original.vercel;
    process.env.CLOUD_WORKER_SNAPSHOT_ID = original.snapshotId;
    process.env.CLOUD_WORKER_SECRET = original.secret;
  });
});
