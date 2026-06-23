import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXER_MARKER,
  githubAppBotLogin,
  isAutomationSender,
  isCommentFixerWebhookEvent,
  shouldTriggerCommentFixerForReview,
  shouldTriggerCommentFixerForReviewComment,
} from "./workflow-constants.js";

const OPENHARNESS_BOT = githubAppBotLogin("openharness");
const OPENHARNESS_IDENTITY = OPENHARNESS_BOT
  ? { kind: "github_bot" as const, login: OPENHARNESS_BOT }
  : null;

describe("isCommentFixerWebhookEvent", () => {
  it("ignores issue_comment on PR threads", () => {
    assert.equal(isCommentFixerWebhookEvent("issue_comment", "created"), false);
  });

  it("accepts per-inline-comment events", () => {
    assert.equal(isCommentFixerWebhookEvent("pull_request_review_comment", "created"), true);
  });

  it("accepts submitted pull request reviews", () => {
    assert.equal(isCommentFixerWebhookEvent("pull_request_review", "submitted"), true);
  });
});

describe("isAutomationSender", () => {
  it("detects Bot type senders", () => {
    assert.equal(isAutomationSender({ login: "vercel[bot]", type: "Bot" }), true);
  });

  it("detects logins ending with [bot]", () => {
    assert.equal(isAutomationSender({ login: "dependabot[bot]", type: "User" }), true);
  });

  it("allows human reviewers", () => {
    assert.equal(isAutomationSender({ login: "simonepriuli", type: "User" }), false);
  });
});

describe("shouldTriggerCommentFixerForReview", () => {
  it("allows OpenHarness bot review submissions with inline feedback", () => {
    assert.equal(
      shouldTriggerCommentFixerForReview(
        {
          review: {
            id: 123,
            state: "commented",
            body: "Found issues in routing and error boundaries.",
          },
          sender: { login: "openharness[bot]", type: "Bot" },
        },
        OPENHARNESS_IDENTITY,
      ),
      true,
    );
  });

  it("allows human review submissions that request changes", () => {
    assert.equal(
      shouldTriggerCommentFixerForReview(
        {
          review: {
            id: 456,
            state: "changes_requested",
            body: "Please address the inline comments.",
          },
          sender: { login: "simonepriuli", type: "User" },
        },
        OPENHARNESS_IDENTITY,
      ),
      true,
    );
  });

  it("skips approved reviews", () => {
    assert.equal(
      shouldTriggerCommentFixerForReview(
        {
          review: { id: 789, state: "approved", body: "LGTM" },
          sender: { login: "openharness[bot]", type: "Bot" },
        },
        OPENHARNESS_IDENTITY,
      ),
      false,
    );
  });

  it("skips fixer marker reviews", () => {
    assert.equal(
      shouldTriggerCommentFixerForReview(
        {
          review: {
            id: 101,
            state: "commented",
            body: `${FIXER_MARKER}\n\nAddressed in latest commit.`,
          },
          sender: { login: "openharness[bot]", type: "Bot" },
        },
        OPENHARNESS_IDENTITY,
      ),
      false,
    );
  });

  it("skips third-party bot reviews", () => {
    assert.equal(
      shouldTriggerCommentFixerForReview(
        {
          review: {
            id: 202,
            state: "commented",
            body: "[vc]: deployment status table",
          },
          sender: { login: "vercel[bot]", type: "Bot" },
        },
        OPENHARNESS_IDENTITY,
      ),
      false,
    );
  });
});

describe("shouldTriggerCommentFixerForReviewComment", () => {
  it("allows human inline comments on the diff", () => {
    assert.equal(
      shouldTriggerCommentFixerForReviewComment(
        {
          comment: { body: "Please rename this variable." },
          sender: { login: "simonepriuli", type: "User" },
        },
        OPENHARNESS_IDENTITY,
      ),
      true,
    );
  });

  it("skips fixer marker inline comments", () => {
    assert.equal(
      shouldTriggerCommentFixerForReviewComment(
        {
          comment: { body: `${FIXER_MARKER}\n\nAddressed.` },
          sender: { login: "openharness[bot]", type: "Bot" },
        },
        OPENHARNESS_IDENTITY,
      ),
      false,
    );
  });
});
