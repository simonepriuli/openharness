import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstallState, verifyInstallState } from "../github/install-state.js";

describe("install state with organization", () => {
  it("round-trips user and organization ids", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-install-state";
    const state = createInstallState("user-1", "org-1");
    const verified = verifyInstallState(state);
    assert.deepEqual(verified, { userId: "user-1", organizationId: "org-1" });
  });

  it("rejects invalid state payloads", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-install-state";
    assert.equal(verifyInstallState("not-a-valid-state"), null);
  });
});
