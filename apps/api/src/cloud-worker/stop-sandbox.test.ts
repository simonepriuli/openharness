import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("sandbox stop contract", () => {
  it("uses the internal workflow-runs API route with sandboxName", () => {
    const apiUrl = "https://api.example.com";
    const sandboxName = "openharness-run-run-1";
    assert.equal(
      `${apiUrl}/api/internal/workflow-runs/sandboxes/stop`,
      "https://api.example.com/api/internal/workflow-runs/sandboxes/stop",
    );
    assert.equal(JSON.stringify({ sandboxName }), '{"sandboxName":"openharness-run-run-1"}');
  });
});
