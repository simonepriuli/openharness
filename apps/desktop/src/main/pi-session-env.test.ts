import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPiSessionSpawnEnv } from "./pi-session-env.js";

describe("buildPiSessionSpawnEnv", () => {
  it("sets conversation context and markdown locks for coding sessions", () => {
    const env = buildPiSessionSpawnEnv(
      { FOO: "bar" },
      { GITHUB_TOKEN: "token" },
      "coding",
      undefined,
      "session-abc",
    );

    assert.equal(env.FOO, "bar");
    assert.equal(env.GITHUB_TOKEN, "token");
    assert.equal(env.OPENHARNESS_CONVERSATION_CONTEXT, "coding");
    assert.ok(env.OPENHARNESS_MARKDOWN_LOCKS_FILE);
    assert.match(String(env.OPENHARNESS_MARKDOWN_LOCKS_FILE), /\.json$/);
    assert.equal(env.OPENHARNESS_ATTACHED_ROOTS_FILE, undefined);
  });

  it("passes attached roots for work and coding contexts", () => {
    const grantsFile = "/tmp/grants.json";
    const workEnv = buildPiSessionSpawnEnv({}, {}, "work", grantsFile, "session-1");
    assert.equal(workEnv.OPENHARNESS_CONVERSATION_CONTEXT, "work");
    assert.equal(workEnv.OPENHARNESS_ATTACHED_ROOTS_FILE, grantsFile);

    const codingEnv = buildPiSessionSpawnEnv({}, {}, "coding", grantsFile, "session-2");
    assert.equal(codingEnv.OPENHARNESS_CONVERSATION_CONTEXT, "coding");
    assert.equal(codingEnv.OPENHARNESS_ATTACHED_ROOTS_FILE, grantsFile);
  });

  it("defaults missing conversation context to coding", () => {
    const env = buildPiSessionSpawnEnv({}, {}, undefined, undefined, undefined);
    assert.equal(env.OPENHARNESS_CONVERSATION_CONTEXT, "coding");
    assert.equal(env.OPENHARNESS_MARKDOWN_LOCKS_FILE, undefined);
  });
});
