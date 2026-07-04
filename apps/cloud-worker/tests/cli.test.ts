import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import { parseCli, printCliHelp } from "../src/cli.js";

describe("parseCli", () => {
  it("defaults to poll mode", () => {
    const pollDefault = parseCli(["node", "index.js"]);
    assert.ok(Result.isOk(pollDefault));
    assert.deepEqual(pollDefault.value, { command: "poll" });

    const pollExplicit = parseCli(["node", "index.js", "poll"]);
    assert.ok(Result.isOk(pollExplicit));
    assert.deepEqual(pollExplicit.value, { command: "poll" });
  });

  it("parses run-once and agent-run-once flags", () => {
    const runOnce = parseCli([
      "node",
      "index.js",
      "run-once",
      "--run-id",
      "run-1",
      "--organization-id",
      "org-1",
    ]);
    assert.ok(Result.isOk(runOnce));
    assert.deepEqual(runOnce.value, {
      command: "run-once",
      args: { runId: "run-1", organizationId: "org-1" },
    });

    const agentRunOnce = parseCli([
      "node",
      "index.js",
      "agent-run-once",
      "--run-id",
      "run-2",
      "--organization-id",
      "org-2",
    ]);
    assert.ok(Result.isOk(agentRunOnce));
    assert.deepEqual(agentRunOnce.value, {
      command: "agent-run-once",
      args: { runId: "run-2", organizationId: "org-2" },
    });
  });

  it("reads ids from environment and handles help aliases", () => {
    const originalRunId = process.env.RUN_ID;
    const originalOrgId = process.env.ORGANIZATION_ID;
    process.env.RUN_ID = "run-env";
    process.env.ORGANIZATION_ID = "org-env";

    assert.deepEqual(parseCli(["node", "index.js", "run-once"]).value, {
      command: "run-once",
      args: { runId: "run-env", organizationId: "org-env" },
    });

    assert.equal(parseCli(["node", "index.js", "help"]).value.command, "help");
    assert.equal(parseCli(["node", "index.js", "--help"]).value.command, "help");
    assert.equal(parseCli(["node", "index.js", "-h"]).value.command, "help");

    process.env.RUN_ID = originalRunId;
    process.env.ORGANIZATION_ID = originalOrgId;
  });

  it("returns errors for missing flags and unknown commands", () => {
    const originalRunId = process.env.RUN_ID;
    const originalOrgId = process.env.ORGANIZATION_ID;
    delete process.env.RUN_ID;
    delete process.env.ORGANIZATION_ID;

    const missingRunOnce = parseCli(["node", "index.js", "run-once"]);
    assert.ok(Result.isError(missingRunOnce));
    assert.match(missingRunOnce.error.message, /run-once requires/);

    const missingAgent = parseCli(["node", "index.js", "agent-run-once"]);
    assert.ok(Result.isError(missingAgent));
    assert.match(missingAgent.error.message, /agent-run-once requires/);

    const unknown = parseCli(["node", "index.js", "nope"]);
    assert.ok(Result.isError(unknown));
    assert.match(unknown.error.message, /Unknown command/);

    process.env.RUN_ID = originalRunId;
    process.env.ORGANIZATION_ID = originalOrgId;
  });

  it("treats empty flag values as missing", () => {
    const originalRunId = process.env.RUN_ID;
    const originalOrgId = process.env.ORGANIZATION_ID;
    delete process.env.RUN_ID;
    delete process.env.ORGANIZATION_ID;

    const result = parseCli([
      "node",
      "index.js",
      "run-once",
      "--run-id",
      " ",
      "--organization-id",
      "org-1",
    ]);
    assert.ok(Result.isError(result));

    process.env.RUN_ID = originalRunId;
    process.env.ORGANIZATION_ID = originalOrgId;
  });

  it("prints help", () => {
    assert.doesNotThrow(() => printCliHelp());
  });
});
