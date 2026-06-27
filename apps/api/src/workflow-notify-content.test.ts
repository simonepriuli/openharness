import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkflowFailedMessage,
  buildWorkflowNotifyMessages,
  buildWorkflowQueuedMessage,
  chunkText,
  DISCORD_MAX_MESSAGE_LENGTH,
  TEAMS_MAX_MESSAGE_LENGTH,
} from "./workflow-notify-content.js";

describe("buildWorkflowNotifyMessages", () => {
  it("includes workflow header and full assistant text on the first chunk", () => {
    const messages = buildWorkflowNotifyMessages({
      workflowName: "Test workflow",
      repoFullName: "owner/repo",
      assistantText: "Why did the developer go broke?\nBecause they used up all their cache.",
      maxChunkLength: DISCORD_MAX_MESSAGE_LENGTH,
    });

    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /\*\*Test workflow\*\*/);
    assert.match(messages[0]!, /Repository: `owner\/repo`/);
    assert.match(messages[0]!, /Why did the developer go broke\?/);
    assert.match(messages[0]!, /Because they used up all their cache\./);
  });

  it("splits long Discord output into multiple messages within the 2000 character limit", () => {
    const longBody = "x".repeat(2500);
    const messages = buildWorkflowNotifyMessages({
      workflowName: "Long report",
      repoFullName: "owner/repo",
      assistantText: longBody,
      maxChunkLength: DISCORD_MAX_MESSAGE_LENGTH,
    });

    assert.ok(messages.length >= 2);
    for (const message of messages) {
      assert.ok(message.length <= DISCORD_MAX_MESSAGE_LENGTH);
    }
    assert.match(messages[0]!, /\*\*Long report\*\*/);
    assert.doesNotMatch(messages[1] ?? "", /\*\*Long report\*\*/);
  });

  it("uses the Teams chunk size without truncating short replies", () => {
    const messages = buildWorkflowNotifyMessages({
      workflowName: "Teams workflow",
      repoFullName: "owner/repo",
      assistantText: "Investigation complete.",
      maxChunkLength: TEAMS_MAX_MESSAGE_LENGTH,
    });

    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Investigation complete\./);
  });
});

describe("chunkText", () => {
  it("splits oversized content into multiple messages", () => {
    const chunks = chunkText(["header", "x".repeat(1800), "y".repeat(400)], 2000);
    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 2000));
  });

  it("clips a single line that exceeds the max length", () => {
    const chunks = chunkText(["z".repeat(2500)], 2000);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.length, 2000);
    assert.match(chunks[0]!, /…$/);
  });
});

describe("buildWorkflowFailedMessage", () => {
  it("formats a failed workflow message", () => {
    const message = buildWorkflowFailedMessage({
      repoFullName: "owner/repo",
      errorMessage: "Branch not found",
    });

    assert.match(message, /\*\*Workflow failed\*\*/);
    assert.match(message, /Repository: `owner\/repo`/);
    assert.match(message, /Branch not found/);
  });
});

describe("buildWorkflowQueuedMessage", () => {
  it("uses singular wording for one workflow", () => {
    assert.equal(buildWorkflowQueuedMessage(1), "Queued 1 workflow for this request.");
  });

  it("uses plural wording for multiple workflows", () => {
    assert.equal(buildWorkflowQueuedMessage(2), "Queued 2 workflows for this request.");
  });
});
