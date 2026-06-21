import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendOverflowToSummary,
  collectDiffNewLines,
  validateInlineComments,
} from "./workflow-review-lines.js";

const samplePatch = `@@ -10,3 +10,4 @@
 context line
-old line
+added line
 unchanged context`;

describe("collectDiffNewLines", () => {
  it("includes context and added line numbers from a hunk", () => {
    const lines = collectDiffNewLines(samplePatch);
    assert.equal(lines.has(10), true);
    assert.equal(lines.has(11), true);
    assert.equal(lines.has(12), true);
    assert.equal(lines.has(13), false);
  });
});

describe("validateInlineComments", () => {
  it("accepts comments anchored to diff lines", () => {
    const result = validateInlineComments(
      [{ filename: "src/App.tsx", patch: samplePatch }],
      [{ path: "src/App.tsx", line: 11, body: "Fix this." }],
    );
    assert.equal(result.valid.length, 1);
    assert.equal(result.invalid.length, 0);
    assert.equal(result.valid[0]?.side, "RIGHT");
  });

  it("rejects comments on lines outside the diff", () => {
    const result = validateInlineComments(
      [{ filename: "src/App.tsx", patch: samplePatch }],
      [{ path: "src/App.tsx", line: 99, body: "Fix this." }],
    );
    assert.equal(result.valid.length, 0);
    assert.equal(result.invalid[0]?.reason, "line not in diff hunk");
  });
});

describe("appendOverflowToSummary", () => {
  it("appends invalid and failed comments to the summary", () => {
    const summary = appendOverflowToSummary(
      "Needs changes.",
      [{ path: "src/a.ts", line: 1, body: "bad line", reason: "line not in diff hunk" }],
      [{ path: "src/b.ts", line: 2, body: "GitHub rejected" }],
    );
    assert.match(summary, /Additional feedback/);
    assert.match(summary, /src\/a.ts:1/);
    assert.match(summary, /src\/b.ts:2/);
  });
});
