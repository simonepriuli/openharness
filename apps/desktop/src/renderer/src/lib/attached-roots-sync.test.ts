import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractExternalMentionPaths, stripTrailingSlashCommand } from "./composer-draft.js";
import { attachedRootsChanged, rootsForMissingMentionPaths } from "./attached-roots-sync.js";

describe("stripTrailingSlashCommand", () => {
  it("removes a lone slash trigger from trailing text", () => {
    const next = stripTrailingSlashCommand([{ type: "text", value: "/" }]);
    assert.deepEqual(next, [{ type: "text", value: "" }]);
  });

  it("removes slash query text while preserving earlier content", () => {
    const next = stripTrailingSlashCommand([{ type: "text", value: "hello /att" }]);
    assert.deepEqual(next, [{ type: "text", value: "hello " }]);
  });
});

describe("extractExternalMentionPaths", () => {
  it("collects absolute mention paths from draft segments", () => {
    const paths = extractExternalMentionPaths([
      { type: "text", value: "check " },
      {
        type: "mention",
        id: "m1",
        relativePath: "/Users/me/Downloads/receipt_info.pdf",
        absolutePath: "/Users/me/Downloads/receipt_info.pdf",
      },
      { type: "text", value: "" },
    ]);
    assert.deepEqual(paths, ["/Users/me/Downloads/receipt_info.pdf"]);
  });

  it("ignores relative project mentions", () => {
    const paths = extractExternalMentionPaths([
      {
        type: "mention",
        id: "m1",
        relativePath: "src/index.ts",
      },
      { type: "text", value: "" },
    ]);
    assert.deepEqual(paths, []);
  });
});

describe("rootsForMissingMentionPaths", () => {
  it("adds grants for absolute mentions missing from attached roots", async () => {
    const merged = await rootsForMissingMentionPaths({
      segments: [
        {
          type: "mention",
          id: "m1",
          relativePath: "/Users/me/Downloads/receipt_info.pdf",
        },
        { type: "text", value: "" },
      ],
      attachedRoots: [],
      attachedRootsFromPaths: async (paths) =>
        paths.map((absolutePath) => ({
          id: "root-1",
          absolutePath,
          kind: "file" as const,
          label: "receipt_info.pdf",
        })),
    });

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.absolutePath, "/Users/me/Downloads/receipt_info.pdf");
  });

  it("detects attached root changes", () => {
    assert.equal(
      attachedRootsChanged([], [
        {
          id: "root-1",
          absolutePath: "/Users/me/Downloads/receipt_info.pdf",
          kind: "file",
          label: "receipt_info.pdf",
        },
      ]),
      true,
    );
  });
});
