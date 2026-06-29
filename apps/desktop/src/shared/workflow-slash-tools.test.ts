import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWorkflowToolId, workflowToggleKeyForToolId } from "./workflow-slash-tools.js";

describe("workflow-slash-tools", () => {
  it("recognizes workflow action tool ids", () => {
    assert.equal(isWorkflowToolId("pr_comment"), true);
    assert.equal(isWorkflowToolId("pr_create"), true);
    assert.equal(isWorkflowToolId("web_search"), false);
  });

  it("maps workflow tool ids to toggle keys", () => {
    assert.equal(workflowToggleKeyForToolId("pr_create"), "prCreate");
    assert.equal(workflowToggleKeyForToolId("pr_push"), "prPush");
    assert.equal(workflowToggleKeyForToolId("teams_notify"), "teamsNotify");
    assert.equal(workflowToggleKeyForToolId("discord_notify"), "discordNotify");
  });
});
