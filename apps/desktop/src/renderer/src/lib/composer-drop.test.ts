import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyDraft, serializeDraft } from "./composer-draft.js";
import { processComposerDrop } from "./composer-drop.js";
import { isSupportedDroppedImageFile } from "./image-attachment.js";

describe("isSupportedDroppedImageFile", () => {
  it("accepts common image mime types", () => {
    assert.equal(isSupportedDroppedImageFile({ name: "photo.png", type: "image/png" } as File), true);
    assert.equal(isSupportedDroppedImageFile({ name: "photo.jpg", type: "image/jpeg" } as File), true);
  });

  it("accepts image extensions when mime type is missing", () => {
    assert.equal(isSupportedDroppedImageFile({ name: "scan.JPEG", type: "" } as File), true);
    assert.equal(isSupportedDroppedImageFile({ name: "notes.pdf", type: "" } as File), false);
  });
});

describe("processComposerDrop", () => {
  it("inserts file mentions without returning attached roots", async () => {
    const result = await processComposerDrop({
      files: [{ name: "brief.pdf", type: "application/pdf" } as File],
      segments: createEmptyDraft(),
      getPathForFile: () => "/Users/me/Desktop/brief.pdf",
      attachedRootsFromPaths: async (paths) =>
        paths.map((absolutePath) => ({
          id: "root-1",
          absolutePath,
          kind: "file" as const,
          label: "brief.pdf",
        })),
    });

    assert.equal(result.attachedRoots.length, 0);
    assert.deepEqual(result.mentionedFilePaths, ["/Users/me/Desktop/brief.pdf"]);
    assert.match(serializeDraft(result.segments), /brief\.pdf/);
  });

  it("attaches folders without inserting mentions", async () => {
    const result = await processComposerDrop({
      files: [{ name: "Documents", type: "" } as File],
      segments: createEmptyDraft(),
      getPathForFile: () => "/Users/me/Documents",
      attachedRootsFromPaths: async (paths) =>
        paths.map((absolutePath) => ({
          id: "root-folder",
          absolutePath,
          kind: "folder" as const,
          label: "Documents",
        })),
    });

    assert.equal(result.attachedRoots.length, 1);
    assert.deepEqual(result.mentionedFilePaths, []);
    assert.equal(serializeDraft(result.segments), "");
  });
});
