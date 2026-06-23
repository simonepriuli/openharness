import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeGithubWorkflowEvent,
  workflowBranchMatches,
  workflowTriggerMatches,
} from "./workflow-trigger-match.js";
import type { WorkflowTrigger } from "./workflow-types.js";

describe("normalizeGithubWorkflowEvent", () => {
  it("maps pull request opened to pr_opened", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request", "opened", {});
    assert.ok(normalized);
    assert.deepEqual(normalized.triggerEvents, ["pr_opened", "pr_updated"]);
  });

  it("maps submitted reviews to review_submitted", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request_review", "submitted", {
      review: { state: "commented" },
      sender: { login: "simonepriuli", type: "User" },
    });
    assert.ok(normalized);
    assert.deepEqual(normalized.triggerEvents, ["review_submitted"]);
  });
});

describe("workflowBranchMatches", () => {
  it("matches when PR base equals workflow branch", () => {
    assert.equal(workflowBranchMatches("develop", "develop"), true);
  });

  it("rejects PRs against other branches", () => {
    assert.equal(workflowBranchMatches("develop", "main"), false);
  });
});

describe("workflowTriggerMatches", () => {
  const trigger: WorkflowTrigger = {
    id: "t1",
    kind: "git_pr",
    event: "pr_opened",
  };

  it("matches when trigger event is included", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request", "opened", {});
    assert.ok(normalized);
    assert.equal(workflowTriggerMatches(trigger, normalized, null), true);
  });

  it("does not match unrelated triggers", () => {
    const normalized = normalizeGithubWorkflowEvent("pull_request_review", "submitted", {
      review: { state: "commented" },
      sender: { login: "simonepriuli", type: "User" },
    });
    assert.ok(normalized);
    assert.equal(workflowTriggerMatches(trigger, normalized, null), false);
  });

  it("matches discord mention trigger when normalized event has discord mention", () => {
    const discordTrigger: WorkflowTrigger = {
      id: "d1",
      kind: "discord_mention",
    };
    assert.equal(
      workflowTriggerMatches(
        discordTrigger,
        {
          eventName: "discord_interaction",
          action: "mention",
          triggerEvents: [],
          discordMention: true,
        },
        null,
      ),
      true,
    );
  });
});
