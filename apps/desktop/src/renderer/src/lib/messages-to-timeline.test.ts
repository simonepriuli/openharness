import assert from "node:assert/strict";
import { test } from "node:test";
import { messagesToTimeline } from "./messages-to-timeline";

test("messagesToTimeline carries assistant entry IDs when present", () => {
  const timeline = messagesToTimeline([
    { role: "user", content: [{ type: "text", text: "Hello" }], entryId: "u1" },
    { role: "assistant", content: [{ type: "text", text: "Hi there" }], entryId: "a1" },
  ]);

  const assistant = timeline.items.find((item) => item.kind === "assistant");
  assert.equal(assistant?.kind, "assistant");
  assert.equal(assistant?.entryId, "a1");
});

test("messagesToTimeline keeps assistant messages without entry IDs renderable", () => {
  const timeline = messagesToTimeline([
    { role: "assistant", content: [{ type: "text", text: "No entry yet" }] },
  ]);

  const assistant = timeline.items.find((item) => item.kind === "assistant");
  assert.equal(assistant?.kind, "assistant");
  assert.equal(assistant?.content, "No entry yet");
  assert.equal(assistant?.entryId, undefined);
});
