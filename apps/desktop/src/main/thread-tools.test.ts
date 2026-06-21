import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { draftFromInstructions, serializeDraft } from "../renderer/src/lib/composer-draft.js";
import { expandPromptTools } from "./expand-prompt-tools.js";
import { extractToolInvocationsFromText } from "../shared/thread-tools.js";

describe("expandPromptTools", () => {
  it("prepends web search guidance", () => {
    const expanded = expandPromptTools("Find the latest React docs", [
      { kind: "tool", id: "web_search" },
    ]);
    assert.match(expanded, /web_search/);
    assert.match(expanded, /Find the latest React docs/);
  });

  it("expands skill blocks from disk", () => {
    const skillPath = fileURLToPath(new URL("./thread-tools.test-skill.md", import.meta.url));
    const expanded = expandPromptTools("Review this change", [
      {
        kind: "skill",
        name: "review-bugbot",
        filePath: skillPath,
        baseDir: "/tmp/skills/review-bugbot",
      },
    ]);
    assert.match(expanded, /<skill name="review-bugbot"/);
    assert.match(expanded, /Review this change/);
  });

  it("returns original message when no tools are provided", () => {
    assert.equal(expandPromptTools("Hello", []), "Hello");
  });

  it("expands workflow instructions from serialized tool tokens", () => {
    const instructions = "Review open PRs /tool:web_search";
    const expanded = expandPromptTools(instructions, extractToolInvocationsFromText(instructions));
    assert.match(expanded, /web_search/);
    assert.match(expanded, /Review open PRs/);
  });

  it("expands workflow PR tool guidance", () => {
    const instructions = "Review this PR /tool:pr_comment";
    const expanded = expandPromptTools(instructions, extractToolInvocationsFromText(instructions));
    assert.match(expanded, /comment on the pull request/i);
    assert.match(expanded, /Review this PR/);
  });
});

describe("workflow instruction drafts", () => {
  it("round-trips tool tokens through draft serialization", () => {
    const serialized = "Use /tool:web_search for release notes";
    const roundTrip = serializeDraft(draftFromInstructions(serialized));
    assert.equal(roundTrip, serialized);
  });
});
