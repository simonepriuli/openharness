import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCronDue,
  validateCronExpression,
  validateScheduleTrigger,
} from "./workflow-cron.js";
import {
  normalizeGithubWorkflowEvent,
  workflowBranchMatches,
  workflowTriggerMatches,
} from "./workflow-trigger-match.js";
import { isWorkflowTrigger, type WorkflowTrigger } from "./workflow-types.js";

describe("isWorkflowTrigger", () => {
  it("accepts git_pr triggers", () => {
    assert.equal(
      isWorkflowTrigger({ id: "1", kind: "git_pr", event: "pr_opened" }),
      true,
    );
  });

  it("accepts schedule triggers with cron and timezone", () => {
    assert.equal(
      isWorkflowTrigger({
        id: "2",
        kind: "schedule",
        preset: "daily",
        cronExpression: "0 9 * * *",
        timezone: "UTC",
      }),
      true,
    );
  });

  it("rejects schedule triggers without cron expression", () => {
    assert.equal(
      isWorkflowTrigger({
        id: "3",
        kind: "schedule",
        cronExpression: "",
        timezone: "UTC",
      }),
      false,
    );
  });
});

describe("validateCronExpression", () => {
  it("accepts a valid daily cron in UTC", () => {
    const result = validateCronExpression("0 9 * * *", "UTC");
    assert.equal(result.ok, true);
  });

  it("rejects an invalid cron expression", () => {
    const result = validateCronExpression("not-a-cron", "UTC");
    assert.equal(result.ok, false);
  });

  it("rejects an invalid timezone", () => {
    const result = validateCronExpression("0 9 * * *", "Not/A/Timezone");
    assert.equal(result.ok, false);
  });
});

describe("validateScheduleTrigger", () => {
  it("validates schedule trigger objects", () => {
    const result = validateScheduleTrigger({
      id: "s1",
      kind: "schedule",
      cronExpression: "0 * * * *",
      timezone: "Europe/Rome",
    });
    assert.equal(result.ok, true);
  });
});

describe("isCronDue", () => {
  it("returns true when now is within the window after a scheduled minute", () => {
    const due = isCronDue("0 9 * * *", "UTC", new Date("2026-06-21T09:00:30.000Z"));
    assert.equal(due, true);
  });
});

describe("workflowBranchMatches", () => {
  it("matches when target branch equals PR base ref", () => {
    assert.equal(workflowBranchMatches("develop", "develop"), true);
  });

  it("is case-insensitive", () => {
    assert.equal(workflowBranchMatches("Develop", "develop"), true);
  });

  it("does not match different branches", () => {
    assert.equal(workflowBranchMatches("develop", "main"), false);
  });

  it("allows all PRs when target branch is empty", () => {
    assert.equal(workflowBranchMatches("", "main"), true);
  });
});

describe("workflowTriggerMatches", () => {
  const trigger: WorkflowTrigger = {
    id: "t1",
    kind: "git_pr",
    event: "pr_opened",
  };

  it("matches when trigger event is included", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request", "opened", {
      prBaseRef: "main",
    });
    assert.ok(normalized);
    assert.equal(workflowTriggerMatches(trigger, normalized, null), true);
  });

  it("ignores schedule triggers", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request", "opened", {
      prBaseRef: "main",
    });
    assert.ok(normalized);
    const scheduleTrigger: WorkflowTrigger = {
      id: "s1",
      kind: "schedule",
      cronExpression: "0 * * * *",
      timezone: "UTC",
    };
    assert.equal(workflowTriggerMatches(scheduleTrigger, normalized, null), false);
  });
});
