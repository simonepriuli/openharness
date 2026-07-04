import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAssistantText } from "./headless-pi.js";

describe("extractAssistantText", () => {
  it("joins assistant message text blocks", () => {
    const text = extractAssistantText([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "First line" },
          { type: "text", text: "Second line" },
        ],
      },
    ]);
    assert.equal(text, "First line\nSecond line");
  });
});

describe("Linear agent Pi resume sequence", () => {
  it("documents switch_session then follow_up for resume mode", () => {
    const resumeSequence = ["switch_session", "follow_up"] as const;
    const newSequence = ["new_session", "prompt"] as const;
    assert.deepEqual(resumeSequence, ["switch_session", "follow_up"]);
    assert.deepEqual(newSequence, ["new_session", "prompt"]);
  });
});
