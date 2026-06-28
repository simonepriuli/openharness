import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterProviderModelRefs } from "./oauth-model-refs.js";

describe("oauth model refs", () => {
  it("removes model refs for a provider prefix", () => {
    const refs = [
      "openrouter/anthropic/claude-sonnet-4",
      "openai-codex/gpt-5.5",
      "openai/gpt-4.1",
      "openai-codex/gpt-5.4",
    ];
    assert.deepEqual(filterProviderModelRefs("openai-codex", refs), [
      "openrouter/anthropic/claude-sonnet-4",
      "openai/gpt-4.1",
    ]);
  });

  it("keeps unrelated refs unchanged", () => {
    const refs = ["openrouter/google/gemma-3-27b-it:free"];
    assert.deepEqual(filterProviderModelRefs("openai-codex", refs), refs);
  });
});
