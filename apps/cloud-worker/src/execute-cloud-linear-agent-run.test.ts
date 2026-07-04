import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  shouldRetainLinearAgentSandbox,
} from "./execute-cloud-linear-agent-run.js";

describe("shouldRetainLinearAgentSandbox", () => {
  const originalMode = process.env.OPENHARNESS_WORKSPACE_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.OPENHARNESS_WORKSPACE_MODE;
    } else {
      process.env.OPENHARNESS_WORKSPACE_MODE = originalMode;
    }
  });

  it("retains sandbox for create and reuse modes", () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "create";
    assert.equal(shouldRetainLinearAgentSandbox(), true);
    process.env.OPENHARNESS_WORKSPACE_MODE = "reuse";
    assert.equal(shouldRetainLinearAgentSandbox(), true);
  });

  it("stops sandbox for cold mode", () => {
    process.env.OPENHARNESS_WORKSPACE_MODE = "cold";
    assert.equal(shouldRetainLinearAgentSandbox(), false);
    delete process.env.OPENHARNESS_WORKSPACE_MODE;
    assert.equal(shouldRetainLinearAgentSandbox(), false);
  });
});
