import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLinearWebhookActor,
  isNonUserLinearActor,
  isOpenHarnessAuthoredLinearComment,
  linearCommentAuthorUserId,
} from "./linear-webhook-comment-filter.js";

describe("linear webhook comment filter", () => {
  it("extracts actor id and type from webhook payload", () => {
    assert.deepEqual(
      extractLinearWebhookActor({
        actor: { id: "actor-1", type: "user", name: "Casey" },
      }),
      { id: "actor-1", type: "user" },
    );
  });

  it("reads comment author user id from webhook data", () => {
    assert.equal(
      linearCommentAuthorUserId({
        id: "comment-1",
        issueId: "issue-1",
        userId: "user-1",
      }),
      "user-1",
    );
  });

  it("detects non-user automation actors", () => {
    assert.equal(isNonUserLinearActor("user"), false);
    assert.equal(isNonUserLinearActor("OAuthApplication"), true);
    assert.equal(isNonUserLinearActor("integration"), true);
  });

  it("treats app actor user id matches as self-authored", () => {
    assert.equal(
      isOpenHarnessAuthoredLinearComment({
        actor: { id: "human-1", type: "user" },
        commentAuthorUserId: "app-user-1",
        appActorUserId: "app-user-1",
      }),
      true,
    );
    assert.equal(
      isOpenHarnessAuthoredLinearComment({
        actor: { id: "app-user-1", type: "user" },
        commentAuthorUserId: "human-1",
        appActorUserId: "app-user-1",
      }),
      true,
    );
  });

  it("does not ignore human comments on other users", () => {
    assert.equal(
      isOpenHarnessAuthoredLinearComment({
        actor: { id: "human-1", type: "user" },
        commentAuthorUserId: "human-1",
        appActorUserId: "app-user-1",
      }),
      false,
    );
  });
});
