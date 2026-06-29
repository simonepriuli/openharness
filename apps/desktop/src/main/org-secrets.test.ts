import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearOrgSecretCache,
  getOrgSecretValue,
  getActiveOrgSecretSlots,
  isOrgSecretActive,
  setOrgSecretCache,
} from "./org-secrets-cache.js";

describe("org-secrets-cache", () => {
  it("stores and resolves configured slots", () => {
    clearOrgSecretCache();
    setOrgSecretCache([
      { slot: "openrouter", value: "org-key" },
      { slot: "exa", value: "exa-key" },
    ]);

    assert.equal(getOrgSecretValue("openrouter"), "org-key");
    assert.equal(getOrgSecretValue("exa"), "exa-key");
    assert.deepEqual(getActiveOrgSecretSlots().sort(), ["exa", "openrouter"]);
    assert.equal(isOrgSecretActive("anthropic"), false);

    clearOrgSecretCache();
    assert.equal(getOrgSecretValue("openrouter"), null);
    assert.equal(getActiveOrgSecretSlots().length, 0);
  });
});
