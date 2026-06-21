import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ParseReviewDecisionError, parseReviewDecision } from "./workflow-review-parse.js";

describe("parseReviewDecision", () => {
  it("parses JSON after narration preamble", () => {
    const decision = parseReviewDecision(`
Now let me read the files and summarize findings.

\`\`\`json
{
  "action": "comment",
  "summary": "Routing and error boundaries need work.",
  "inlineComments": [
    { "path": "apps/web/src/App.tsx", "line": 84, "body": "Avoid top-level Suspense here." }
  ]
}
\`\`\`
`);

    assert.equal(decision.action, "comment");
    assert.equal(decision.summary, "Routing and error boundaries need work.");
    assert.equal(decision.inlineComments.length, 1);
    assert.equal(decision.inlineComments[0]?.path, "apps/web/src/App.tsx");
  });

  it("parses approve with no inline comments", () => {
    const decision = parseReviewDecision(`\`\`\`json
{
  "action": "approve",
  "summary": "Looks good to merge.",
  "inlineComments": []
}
\`\`\``);

    assert.equal(decision.action, "approve");
    assert.equal(decision.inlineComments.length, 0);
  });

  it("throws when JSON block is missing", () => {
    assert.throws(
      () => parseReviewDecision("Looks good to me, no issues found."),
      ParseReviewDecisionError,
    );
  });

  it("throws when JSON is invalid", () => {
    assert.throws(
      () => parseReviewDecision("```json\n{ not valid json\n```"),
      ParseReviewDecisionError,
    );
  });
});
