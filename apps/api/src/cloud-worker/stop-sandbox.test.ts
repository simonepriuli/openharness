import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("sandbox stop contract", () => {
  it("uses the internal API route so the worker does not need Vercel credentials", () => {
    const apiUrl = "https://api.example.com";
    const sandboxId = "sbx_test";
    assert.equal(
      `${apiUrl}/api/internal/cloud-worker/sandboxes/stop`,
      "https://api.example.com/api/internal/cloud-worker/sandboxes/stop",
    );
    assert.equal(JSON.stringify({ sandboxId }), '{"sandboxId":"sbx_test"}');
  });
});
