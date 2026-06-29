import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  postWorkflowRunDiscordNotify,
  postWorkflowRunTeamsNotify,
} from "./workflow-notify-handler.js";

describe("postWorkflowRunDiscordNotify", () => {
  it("rejects empty summaries", async () => {
    const result = await postWorkflowRunDiscordNotify({} as never, "org-1", "run-1", "   ");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "summary is required");
    }
  });
});

describe("postWorkflowRunTeamsNotify", () => {
  it("rejects empty summaries", async () => {
    const result = await postWorkflowRunTeamsNotify({} as never, "org-1", "run-1", "");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "summary is required");
    }
  });
});
