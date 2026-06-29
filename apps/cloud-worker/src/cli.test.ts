import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCli, printCliHelp } from "./cli.js";

describe("parseCli", () => {
  it("defaults to poll mode", () => {
    assert.deepEqual(parseCli(["node", "index.js"]), { command: "poll" });
    assert.deepEqual(parseCli(["node", "index.js", "poll"]), { command: "poll" });
  });

  it("parses run-once flags", () => {
    assert.deepEqual(
      parseCli([
        "node",
        "index.js",
        "run-once",
        "--run-id",
        "run-1",
        "--organization-id",
        "org-1",
      ]),
      {
        command: "run-once",
        args: { runId: "run-1", organizationId: "org-1" },
      },
    );
  });

  it("reads run-once ids from environment", () => {
    const originalRunId = process.env.RUN_ID;
    const originalOrgId = process.env.ORGANIZATION_ID;
    process.env.RUN_ID = "run-env";
    process.env.ORGANIZATION_ID = "org-env";

    assert.deepEqual(parseCli(["node", "index.js", "run-once"]), {
      command: "run-once",
      args: { runId: "run-env", organizationId: "org-env" },
    });

    process.env.RUN_ID = originalRunId;
    process.env.ORGANIZATION_ID = originalOrgId;
  });

  it("prints help", () => {
    assert.equal(parseCli(["node", "index.js", "help"]).command, "help");
    assert.doesNotThrow(() => printCliHelp());
  });
});
