import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWorkflowTemplate, WORKFLOW_TEMPLATES } from "./workflow-constants.js";

describe("workflow templates", () => {
  it("includes the dependency CVE scan security template", () => {
    const template = getWorkflowTemplate("dependency_cve_scan");
    assert.equal(template.name, "Dependency CVE scan");
    assert.match(template.instructions, /Search the web/i);
    assert.doesNotMatch(template.instructions, /\/tool:/);
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
      prCreate: false,
      teamsNotify: true,
      discordNotify: false,
    });
  });

  it("includes the Discord CVE scan security template", () => {
    const template = getWorkflowTemplate("discord_cve_scan");
    assert.equal(template.name, "Discord CVE scan");
    assert.match(template.instructions, /Search the web/i);
    assert.match(template.instructions, /Discord channel/i);
    assert.equal(template.triggers.length, 1);
    assert.equal(template.triggers[0]?.kind, "schedule");
    assert.deepEqual(template.tools, {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: true,
    });
  });

  it("exposes all templates through WORKFLOW_TEMPLATES", () => {
    const ids = WORKFLOW_TEMPLATES.map((template) => template.id);
    assert.deepEqual(ids, [
      "pr_review",
      "comment_fixer",
      "dependency_cve_scan",
      "discord_cve_scan",
      "teams_bug_triage",
      "discord_bug_triage",
      "linear_issue_triage",
      "linear_comment_triage",
      "linear_issue_implementation",
      "linear_implementation_plan",
      "linear_plan_build",
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

  it("includes Linear workflow templates", () => {
    const issueTriage = getWorkflowTemplate("linear_issue_triage");
    assert.equal(issueTriage.triggers[0]?.kind, "linear");
    if (issueTriage.triggers[0]?.kind === "linear") {
      assert.equal(issueTriage.triggers[0].event, "linear_issue_created");
    }
    assert.equal(issueTriage.tools.linearRead, true);
    assert.equal(issueTriage.tools.linearComments, true);

    const commentTriage = getWorkflowTemplate("linear_comment_triage");
    assert.equal(commentTriage.triggers[0]?.kind, "linear");
    if (commentTriage.triggers[0]?.kind === "linear") {
      assert.equal(commentTriage.triggers[0].event, "linear_comment_created");
    }

    const implementation = getWorkflowTemplate("linear_issue_implementation");
    assert.equal(implementation.tools.linearWrite, true);
    assert.equal(implementation.tools.prCreate, true);
    assert.equal(implementation.tools.prPush, true);

    const implementationPlan = getWorkflowTemplate("linear_implementation_plan");
    assert.equal(implementationPlan.triggers[0]?.kind, "linear");
    if (implementationPlan.triggers[0]?.kind === "linear") {
      assert.equal(implementationPlan.triggers[0].event, "linear_issue_created");
    }
    assert.equal(implementationPlan.tools.linearRead, true);
    assert.equal(implementationPlan.tools.linearComments, true);
    assert.equal(implementationPlan.tools.prCreate, false);

    const planBuild = getWorkflowTemplate("linear_plan_build");
    assert.equal(planBuild.triggers[0]?.kind, "linear");
    if (planBuild.triggers[0]?.kind === "linear") {
      assert.equal(planBuild.triggers[0].event, "linear_comment_created");
    }
    assert.equal(planBuild.tools.prCreate, true);
    assert.equal(planBuild.tools.prPush, true);
  });

  it("uses natural-language instructions for notify workflow templates", () => {
    for (const id of [
      "dependency_cve_scan",
      "discord_cve_scan",
      "teams_bug_triage",
      "discord_bug_triage",
      "linear_issue_triage",
      "linear_comment_triage",
      "linear_issue_implementation",
      "linear_implementation_plan",
      "linear_plan_build",
    ] as const) {
      const template = getWorkflowTemplate(id);
      assert.doesNotMatch(template.instructions, /```json/i);
      assert.doesNotMatch(template.instructions, /JSON code block/i);
      assert.doesNotMatch(template.instructions, /\/tool:/);
      assert.doesNotMatch(template.instructions, /post_teams_message/);
      assert.doesNotMatch(template.instructions, /post_discord_message/);
    }
    assert.match(getWorkflowTemplate("dependency_cve_scan").instructions, /Teams channel/i);
    assert.match(getWorkflowTemplate("discord_cve_scan").instructions, /Discord channel/i);
    assert.match(getWorkflowTemplate("teams_bug_triage").instructions, /Teams channel/i);
    assert.match(getWorkflowTemplate("discord_bug_triage").instructions, /Discord channel/i);
    assert.match(getWorkflowTemplate("linear_issue_triage").instructions, /Linear issue/i);
    assert.match(getWorkflowTemplate("linear_comment_triage").instructions, /Linear issue/i);
    assert.match(getWorkflowTemplate("linear_issue_implementation").instructions, /pull request/i);
    assert.match(getWorkflowTemplate("linear_implementation_plan").instructions, /implementation plan/i);
    assert.match(getWorkflowTemplate("linear_plan_build").instructions, /implementation plan/i);
  });

  it("uses natural-language instructions for PR review templates", () => {
    for (const id of ["pr_review", "comment_fixer"] as const) {
      const template = getWorkflowTemplate(id);
      assert.doesNotMatch(template.instructions, /```json/i);
      assert.doesNotMatch(template.instructions, /JSON code block/i);
      assert.doesNotMatch(template.instructions, /\/tool:/);
      assert.doesNotMatch(template.instructions, /approve_pull_request/);
      assert.doesNotMatch(template.instructions, /submit_pull_request_review/);
      assert.doesNotMatch(template.instructions, /push_branch/);
    }
    assert.match(getWorkflowTemplate("pr_review").instructions, /approve it/i);
    assert.match(getWorkflowTemplate("comment_fixer").instructions, /push your commits/i);
  });
});
