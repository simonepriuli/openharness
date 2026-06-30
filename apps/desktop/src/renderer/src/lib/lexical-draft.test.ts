import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyDraft,
  draftFromInstructions,
  extractToolsFromDraft,
  serializeDraft,
  type ComposerSegment,
} from "./composer-draft.js";
import {
  filterEditorSegments,
  getTrailingEditorText,
  hasEditorTextContent,
  mergeSegmentsWithImages,
} from "./lexical-draft.js";

describe("lexical-draft helpers", () => {
  it("keeps image segments separate from editor segments", () => {
    const imageSegment = {
      type: "image" as const,
      id: "seg-image-1",
      mimeType: "image/png",
      data: "abc",
      previewUrl: "blob:test",
    };
    const editorSegments: ComposerSegment[] = [
      { type: "text", value: "hello" },
    ];
    const merged = mergeSegmentsWithImages(editorSegments, [imageSegment]);
    assert.equal(merged[0]?.type, "image");
    assert.equal(merged[1]?.type, "text");
    assert.equal(filterEditorSegments(merged).length, 1);
  });

  it("serializes inline tool and mention segments for send parity", () => {
    const segments = draftFromInstructions(
      "can you use /tool:web_search to search for docs about @README.md",
    );
    assert.equal(
      serializeDraft(segments),
      "can you use /tool:web_search to search for docs about @README.md",
    );
    assert.deepEqual(extractToolsFromDraft(segments), [{ kind: "tool", id: "web_search" }]);
    assert.equal(
      serializeDraft(draftFromInstructions(serializeDraft(segments))),
      "can you use /tool:web_search to search for docs about @README.md",
    );
  });

  it("detects editor content and trailing text", () => {
    const empty = createEmptyDraft();
    assert.equal(hasEditorTextContent(empty), false);
    assert.equal(getTrailingEditorText(empty), "");

    const withTool = draftFromInstructions("use /tool:web_search now");
    assert.equal(hasEditorTextContent(withTool), true);
    assert.equal(getTrailingEditorText(withTool), " now");
  });
});
