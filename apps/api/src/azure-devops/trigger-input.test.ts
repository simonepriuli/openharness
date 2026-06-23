import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXER_MARKER,
  shouldTriggerCommentFixerForReview,
  shouldTriggerCommentFixerForReviewComment,
  type AutomationIdentity,
} from "../github/workflow-constants.js";
import { workflowTriggerMatches } from "../github/workflow-trigger-match.js";
import type { WorkflowTrigger } from "../github/workflow-types.js";
import { normalizeAdoWorkflowTriggerInput } from "./trigger-input.js";
import type { NormalizedWebhookEvent } from "../source-control/types.js";

const ADO_IDENTITY: AutomationIdentity = {
  kind: "ado_service_account",
  id: "svc-user-id",
  displayName: "OpenHarness Service",
};

function adoEvent(
  event: NormalizedWebhookEvent["event"],
  resource: Record<string, unknown>,
): NormalizedWebhookEvent {
  return {
    event,
    deliveryId: "delivery-1",
    namespace: "MyProject",
    repoName: "my-repo",
    prNumber: 42,
    payload: { resource },
    connectionExternalId: "contoso",
  };
}

describe("normalizeAdoWorkflowTriggerInput", () => {
  it("maps reviewer vote to review_submitted trigger input", () => {
    const normalized = normalizeAdoWorkflowTriggerInput(
      adoEvent("review_submitted", {
        reviewer: {
          id: "user-1",
          displayName: "Jane Doe",
          vote: 10,
        },
        pullRequest: { targetRefName: "refs/heads/main" },
      }),
    );

    assert.ok(normalized);
    assert.deepEqual(normalized.triggerEvents, ["review_submitted"]);
    assert.deepEqual(normalized.reviewInput, {
      review: { state: "approved", body: null },
      sender: { id: "user-1", login: "Jane Doe" },
    });
    assert.equal(normalized.prBaseRef, "main");
  });

  it("maps diff comment webhooks to pr_comment_on_diff trigger input", () => {
    const normalized = normalizeAdoWorkflowTriggerInput(
      adoEvent("pr_comment_on_diff", {
        comment: {
          content: "nit: rename this",
          author: { id: "user-2", displayName: "Reviewer" },
        },
        pullRequest: { targetRefName: "refs/heads/develop" },
      }),
    );

    assert.ok(normalized);
    assert.deepEqual(normalized.triggerEvents, ["pr_comment_on_diff"]);
    assert.deepEqual(normalized.reviewCommentInput, {
      comment: { body: "nit: rename this" },
      sender: { id: "user-2", login: "Reviewer" },
    });
    assert.equal(normalized.prBaseRef, "develop");
  });
});

describe("ADO comment fixer trigger matching", () => {
  const reviewTrigger: WorkflowTrigger = {
    id: "fixer-review",
    kind: "git_pr",
    event: "review_submitted",
  };

  const commentTrigger: WorkflowTrigger = {
    id: "fixer-comment",
    kind: "git_pr",
    event: "pr_comment_on_diff",
  };

  it("triggers fixer when the service account submits actionable review feedback", () => {
    const normalized = normalizeAdoWorkflowTriggerInput(
      adoEvent("review_submitted", {
        reviewer: {
          id: ADO_IDENTITY.id,
          displayName: ADO_IDENTITY.displayName,
          vote: -10,
        },
      }),
    );
    assert.ok(normalized);

    assert.equal(
      shouldTriggerCommentFixerForReview(normalized.reviewInput!, ADO_IDENTITY),
      true,
    );
    assert.equal(workflowTriggerMatches(reviewTrigger, normalized, ADO_IDENTITY), true);
  });

  it("triggers fixer for human review comments", () => {
    const normalized = normalizeAdoWorkflowTriggerInput(
      adoEvent("review_submitted", {
        reviewer: {
          id: "human-1",
          displayName: "Human Reviewer",
          vote: -10,
        },
      }),
    );
    assert.ok(normalized);

    assert.equal(
      shouldTriggerCommentFixerForReview(normalized.reviewInput!, ADO_IDENTITY),
      true,
    );
    assert.equal(workflowTriggerMatches(reviewTrigger, normalized, ADO_IDENTITY), true);
  });

  it("skips fixer when the service account reply includes the fixer marker", () => {
    const normalized = normalizeAdoWorkflowTriggerInput(
      adoEvent("pr_comment_on_diff", {
        comment: {
          content: `${FIXER_MARKER}\n\nAddressed in latest commit.`,
          author: { id: ADO_IDENTITY.id, displayName: ADO_IDENTITY.displayName },
        },
      }),
    );
    assert.ok(normalized);

    assert.equal(
      shouldTriggerCommentFixerForReviewComment(normalized.reviewCommentInput!, ADO_IDENTITY),
      false,
    );
    assert.equal(workflowTriggerMatches(commentTrigger, normalized, ADO_IDENTITY), false);
  });
});
