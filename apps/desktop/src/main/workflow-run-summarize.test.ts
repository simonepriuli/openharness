import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackResultMarkdown } from "./workflow-run-result.js";

describe("fallbackResultMarkdown", () => {
  it("strips JSON blocks and trims output", () => {
    const markdown = fallbackResultMarkdown("Report\n\n```json\n{}\n```");
    assert.equal(markdown, "Report");
  });

  it("returns empty string for blank input", () => {
    assert.equal(fallbackResultMarkdown("   "), "");
  });

  it("truncates very long output", () => {
    const long = "x".repeat(20_000);
    const markdown = fallbackResultMarkdown(long);
    assert.equal(markdown.length, 16_000);
    assert.ok(markdown.endsWith("..."));
  });
});

describe("summarizeWorkflowRun fallback behavior", () => {
  it("uses fallback markdown when model ref is invalid", () => {
    const assistantText = "Found 2 issues in dependencies.";
    const modelRef = "not-a-valid-model-ref";
    const slash = modelRef.indexOf("/");
    assert.ok(slash <= 0);
    assert.equal(fallbackResultMarkdown(assistantText), assistantText);
  });
});
