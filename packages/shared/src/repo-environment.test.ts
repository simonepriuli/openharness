import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReservedRepoEnvKey, validateRepoEnvKey } from "./repo-environment.js";

describe("repo environment key validation", () => {
  it("accepts valid UPPER_SNAKE_CASE keys", () => {
    const result = validateRepoEnvKey("STAGING_API_URL");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.normalized, "STAGING_API_URL");
    }
  });

  it("rejects lowercase keys", () => {
    const result = validateRepoEnvKey("staging_api_url");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "INVALID_FORMAT");
  });

  it("rejects org secret slot names", () => {
    assert.equal(isReservedRepoEnvKey("OPENROUTER"), true);
    assert.equal(isReservedRepoEnvKey("ANTHROPIC"), true);
    const result = validateRepoEnvKey("OPENROUTER");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "RESERVED");
  });

  it("rejects OPENHARNESS_ prefix", () => {
    const result = validateRepoEnvKey("OPENHARNESS_TOKEN");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "RESERVED");
  });
});
