import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import {
  postWorkflowRunDiscordNotify,
  postWorkflowRunTeamsNotify,
} from "./workflow-notify-handler.js";
import { NotifyError } from "./errors.js";

describe("postWorkflowRunDiscordNotify", () => {
  it("rejects empty summaries", async () => {
    const result = await postWorkflowRunDiscordNotify({} as never, "org-1", "run-1", "   ");
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.equal(NotifyError.is(result.error), true);
      assert.equal(result.error.status, 400);
      assert.equal(result.error.message, "summary is required");
    }
  });
});

describe("postWorkflowRunTeamsNotify", () => {
  it("rejects empty summaries", async () => {
    const result = await postWorkflowRunTeamsNotify({} as never, "org-1", "run-1", "");
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.equal(NotifyError.is(result.error), true);
      assert.equal(result.error.status, 400);
      assert.equal(result.error.message, "summary is required");
    }
  });
});
