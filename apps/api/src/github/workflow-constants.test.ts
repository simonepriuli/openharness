import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWorkflowTemplate, WORKFLOW_TEMPLATES } from "./workflow-constants.js";

describe("workflow templates", () => {
  it("includes the dependency CVE scan security template", () => {
    const template = getWorkflowTemplate("dependency_cve_scan");
    assert.equal(template.name, "Dependency CVE scan");
    assert.match(template.instructions, /\/tool:web_search/);
    assert.equal(template.triggers.length, 1);
    assert.equal(template.triggers[0]?.kind, "schedule");
    if (template.triggers[0]?.kind === "schedule") {
      assert.equal(template.triggers[0].preset, "weekly");
      assert.equal(template.triggers[0].cronExpression, "0 9 * * 1");
    }
    assert.deepEqual(template.tools, {
      prComment: false,
      prApprove: false,
      prPush: false,
      teamsNotify: true,
      discordNotify: false,
    });
  });

  it("exposes all templates through WORKFLOW_TEMPLATES", () => {
    const ids = WORKFLOW_TEMPLATES.map((template) => template.id);
    assert.deepEqual(ids, [
      "pr_review",
      "comment_fixer",
      "dependency_cve_scan",
      "teams_bug_triage",
      "discord_bug_triage",
    ]);
  });

  it("includes the Teams bug triage template", () => {
    const template = getWorkflowTemplate("teams_bug_triage");
    assert.equal(template.triggers[0]?.kind, "teams_mention");
    assert.equal(template.tools.teamsNotify, true);
    assert.equal(template.tools.discordNotify, false);
  });

  it("includes the Discord bug triage template", () => {
    const template = getWorkflowTemplate("discord_bug_triage");
    assert.equal(template.triggers[0]?.kind, "discord_mention");
    assert.equal(template.tools.teamsNotify, false);
    assert.equal(template.tools.discordNotify, true);
  });

  it("uses markdown-only instructions for notify workflow templates", () => {
    for (const id of ["dependency_cve_scan", "teams_bug_triage", "discord_bug_triage"] as const) {
      const template = getWorkflowTemplate(id);
      assert.doesNotMatch(template.instructions, /```json/i);
      assert.doesNotMatch(template.instructions, /JSON code block/i);
      assert.match(template.instructions, /markdown/i);
    }
  });
});
