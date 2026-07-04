import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCloudWorkerEnv } from "../src/load-env.js";

describe("loadCloudWorkerEnv", () => {
  const files: string[] = [];

  after(() => {
    for (const file of files) {
      unlinkSync(file);
    }
  });

  it("loads existing env files and skips missing ones", () => {
    const existing = join(tmpdir(), `cloud-worker-env-${process.pid}.env`);
    writeFileSync(existing, "CLOUD_WORKER_TEST=1\n", "utf8");
    files.push(existing);

    const missing = join(tmpdir(), `cloud-worker-missing-${process.pid}.env`);

    assert.doesNotThrow(() =>
      loadCloudWorkerEnv({ envFiles: [existing, missing] }),
    );
    assert.equal(process.env.CLOUD_WORKER_TEST, "1");
    delete process.env.CLOUD_WORKER_TEST;
  });
});
