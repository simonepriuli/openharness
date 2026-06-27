import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enabledToolsFromWorkflowToggles,
  githubActionToolForWorkflowToolId,
  workflowToolIdForGithubAction,
} from "./github-actions-mappings.js";

describe("github-actions mappings", () => {
  it("maps workflow toggles to GitHub action tool names", () => {
    assert.deepEqual(
      enabledToolsFromWorkflowToggles({
        prComment: true,
        prApprove: false,
        prPush: true,
        prCreate: true,
      }),
      ["submit_pull_request_review", "create_pull_request", "push_branch"],
    );
  });

  it("returns no tools when all toggles are off", () => {
    assert.deepEqual(
      enabledToolsFromWorkflowToggles({
        prComment: false,
        prApprove: false,
        prPush: false,
        prCreate: false,
      }),
      [],
    );
  });

  it("maps slash tool ids to workflow toggles", () => {
    assert.equal(githubActionToolForWorkflowToolId("pr_create"), "create_pull_request");
    assert.equal(workflowToolIdForGithubAction("push_branch"), "prPush");
  });
});
