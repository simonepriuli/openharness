import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { branchFetchRef } from "./workflow-git.js";

describe("branchFetchRef", () => {
  it("uses a dedicated fetch ref that is not a checked-out branch", () => {
    assert.equal(branchFetchRef("branch", "main"), "refs/openharness/fetches/branch-main");
    assert.equal(branchFetchRef("pr", "42"), "refs/openharness/fetches/pr-42");
  });
});
