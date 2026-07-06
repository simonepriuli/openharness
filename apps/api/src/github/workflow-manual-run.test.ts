import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import { manualDeliveryId } from "./workflow-cron.js";
import { validateManualWorkflowRun } from "./workflow-manual-run.js";
import { isScheduleOnlyWorkflow } from "./workflow-types.js";

describe("manualDeliveryId", () => {
  it("uses a manual prefix with workflow and run ids", () => {
    assert.equal(
      manualDeliveryId("wf-1", "run-1"),
      "manual:wf-1:run-1",
    );
  });
});

describe("isScheduleOnlyWorkflow", () => {
  it("accepts workflows with only schedule triggers", () => {
    assert.equal(
      isScheduleOnlyWorkflow([
        {
          id: "t1",
          kind: "schedule",
          cronExpression: "0 9 * * 1",
          timezone: "UTC",
        },
      ]),
      true,
    );
  });

  it("rejects mixed or empty trigger lists", () => {
    assert.equal(isScheduleOnlyWorkflow([]), false);
    assert.equal(
      isScheduleOnlyWorkflow([
        {
          id: "t1",
          kind: "schedule",
          cronExpression: "0 9 * * 1",
          timezone: "UTC",
        },
        {
          id: "t2",
          kind: "git_pr",
          event: "pr_opened",
        },
      ]),
      false,
    );
  });
});

describe("validateManualWorkflowRun", () => {
  const baseWorkflow = {
    id: "wf-1",
    connectionId: "conn-1",
    name: "CVE scan",
    enabled: false,
    localOnly: false,
    executionTarget: "auto" as const,
    userId: "user-1",
    model: "openai/gpt-4.1",
    instructions: "Scan dependencies",
    targetBranch: "main",
    triggers: [
      {
        id: "sched-1",
        kind: "schedule" as const,
        preset: "weekly" as const,
        cronExpression: "0 9 * * 1",
        timezone: "UTC",
        label: "Weekly",
      },
    ],
    tools: { prComment: false, prApprove: false, prPush: false, prCreate: false, teamsNotify: false },
    fullName: "acme/repo",
    owner: "acme",
    repo: "repo",
    projectPath: "/tmp/repo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a schedule-only workflow with a valid cron trigger", () => {
    const result = validateManualWorkflowRun(baseWorkflow);
    assert.equal(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assert.equal(result.value.trigger.id, "sched-1");
    }
  });

  it("rejects workflows that are not schedule-only", () => {
    const result = validateManualWorkflowRun({
      ...baseWorkflow,
      triggers: [
        {
          id: "pr-1",
          kind: "git_pr",
          event: "pr_opened",
        },
      ],
    });
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.match(result.error.message, /schedule-only/i);
    }
  });

  it("rejects workflows without a target branch", () => {
    const result = validateManualWorkflowRun({
      ...baseWorkflow,
      targetBranch: "   ",
    });
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.match(result.error.message, /targetBranch/i);
    }
  });

  it("rejects invalid cron expressions", () => {
    const result = validateManualWorkflowRun({
      ...baseWorkflow,
      triggers: [
        {
          id: "sched-1",
          kind: "schedule",
          cronExpression: "",
          timezone: "UTC",
        },
      ],
    });
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.match(result.error.message, /cron/i);
    }
  });
});
