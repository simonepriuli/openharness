import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdoRunPayloadSlice } from "./run-payload.js";

describe("buildAdoRunPayloadSlice", () => {
  it("maps PR refs and commits into runner-compatible pullRequest fields", () => {
    const slice = buildAdoRunPayloadSlice(
      {
        title: "Add feature",
        description: "Details",
        sourceRefName: "refs/heads/feature/foo",
        targetRefName: "refs/heads/main",
        lastMergeSourceCommit: { commitId: "abc123" },
        lastMergeTargetCommit: { commitId: "def456" },
        url: "https://dev.azure.com/contoso/_git/repo/pullrequest/42",
      },
      42,
      {},
    );

    assert.deepEqual(slice.pullRequest, {
      number: 42,
      title: "Add feature",
      body: "Details",
      htmlUrl: "https://dev.azure.com/contoso/_git/repo/pullrequest/42",
      headRef: "feature/foo",
      headSha: "abc123",
      baseRef: "main",
      baseSha: "def456",
    });
  });

  it("includes review metadata from reviewer vote", () => {
    const slice = buildAdoRunPayloadSlice(
      {
        sourceRefName: "refs/heads/feature",
        targetRefName: "refs/heads/main",
      },
      7,
      {
        resource: {
          reviewer: {
            id: "user-1",
            displayName: "Jane Doe",
            vote: -10,
          },
        },
      },
    );

    assert.deepEqual(slice.review, {
      id: "user-1",
      state: "changes_requested",
      body: null,
      authorId: "user-1",
      authorName: "Jane Doe",
    });
  });

  it("includes comment metadata from thread comment webhooks", () => {
    const slice = buildAdoRunPayloadSlice(
      {
        sourceRefName: "refs/heads/feature",
        targetRefName: "refs/heads/main",
      },
      3,
      {
        resource: {
          comment: {
            id: 99,
            content: "Please fix this line",
            author: { id: "user-2", displayName: "Reviewer" },
          },
        },
      },
    );

    assert.deepEqual(slice.comment, {
      id: 99,
      body: "Please fix this line",
      authorId: "user-2",
      authorName: "Reviewer",
    });
  });
});
