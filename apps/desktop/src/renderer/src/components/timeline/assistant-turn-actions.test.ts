import assert from "node:assert/strict";
import { test } from "node:test";
import { collectAssistantTurnActions } from "./assistant-turn-actions";

test("collectAssistantTurnActions joins assistant chunks and keeps the last entry id", () => {
  const actions = collectAssistantTurnActions([
    { id: "a1", content: "First chunk", entryId: "e1" },
    { id: "a2", content: "Second chunk", entryId: "e2" },
  ]);

  assert.equal(actions?.content, "First chunk\n\nSecond chunk");
  assert.equal(actions?.entryId, "e2");
  assert.equal(actions?.key, "turn-actions-a2");
});

test("collectAssistantTurnActions ignores empty assistant chunks", () => {
  const actions = collectAssistantTurnActions([
    { id: "a1", content: "   " },
    { id: "a2", content: "Only content" },
  ]);

  assert.equal(actions?.content, "Only content");
});
