import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractProjectId, issueIdFromPayload } from "./linear-webhook-payload.js";

describe("linear webhook payload parsing", () => {
  it("reads projectId from issue webhook data", () => {
    const projectId = extractProjectId({
      type: "Issue",
      action: "create",
      data: {
        id: "issue-1",
        projectId: "project-1",
      },
    });
    assert.equal(projectId, "project-1");
  });

  it("reads nested project.id when projectId is absent", () => {
    const projectId = extractProjectId({
      type: "Issue",
      data: {
        id: "issue-1",
        project: { id: "project-2", name: "OpenHarness" },
      },
    });
    assert.equal(projectId, "project-2");
  });

  it("ignores null projectId so callers can fetch the issue", () => {
    const projectId = extractProjectId({
      type: "Issue",
      data: {
        id: "issue-1",
        projectId: null,
        teamId: "team-1",
      },
    });
    assert.equal(projectId, null);
    assert.equal(
      issueIdFromPayload({
        id: "issue-1",
        projectId: null,
        teamId: "team-1",
      }),
      "issue-1",
    );
  });

  it("reads issue id from comment webhook data", () => {
    assert.equal(
      issueIdFromPayload(
        {
          id: "comment-1",
          issueId: "issue-9",
        },
        { resourceType: "Comment" },
      ),
      "issue-9",
    );
  });
});
