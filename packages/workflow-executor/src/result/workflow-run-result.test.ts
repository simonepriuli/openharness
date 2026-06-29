import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractResultPayload, stripJsonBlocks } from "../result/workflow-run-result.js";

describe("extractResultPayload", () => {
  it("extracts bug triage payload from teams mention output", () => {
    const payload = extractResultPayload(
      `Investigated the crash in checkout.

\`\`\`json
{
  "summary": "Null reference in payment handler.",
  "findings": ["Missing guard on cart.total"],
  "suggestedNextSteps": ["Add regression test"]
}
\`\`\``,
      "teams_mention",
    );

    assert.equal(payload.kind, "bug_triage");
    if (payload.kind !== "bug_triage") return;
    assert.equal(payload.summary, "Null reference in payment handler.");
    assert.deepEqual(payload.findings, ["Missing guard on cart.total"]);
    assert.deepEqual(payload.suggestedNextSteps, ["Add regression test"]);
  });

  it("extracts CVE scan payload for scheduled runs", () => {
    const payload = extractResultPayload(
      `\`\`\`json
{
  "summary": "Two moderate issues found.",
  "vulnerabilities": [
    {
      "dependency": "lodash",
      "version": "4.17.20",
      "severity": "moderate",
      "advisory": "GHSA-xxxx",
      "action": "Upgrade to 4.17.21"
    }
  ]
}
\`\`\``,
      "schedule",
      "dependency_cve_scan",
    );

    assert.equal(payload.kind, "cve_scan");
    if (payload.kind !== "cve_scan") return;
    assert.equal(payload.summary, "Two moderate issues found.");
    assert.equal(payload.vulnerabilities.length, 1);
    assert.equal(payload.vulnerabilities[0]?.dependency, "lodash");
  });

  it("uses generic summary for PR review workflows", () => {
    const payload = extractResultPayload(
      "Approved the pull request after reviewing auth changes.",
      "synchronize",
      "pr_review",
    );

    assert.equal(payload.kind, "generic");
    if (payload.kind !== "generic") return;
    assert.equal(payload.summary, "Approved the pull request after reviewing auth changes.");
  });
});

describe("stripJsonBlocks", () => {
  it("removes fenced JSON blocks", () => {
    const stripped = stripJsonBlocks("Summary text\n\n```json\n{}\n```\n\nTail");
    assert.equal(stripped, "Summary text\n\nTail");
  });
});
