import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Result } from "better-result";
import { createLinearIssue, deleteLinearWebhook } from "./linear-client.js";

const sampleIssue = {
  id: "issue_1",
  identifier: "ENG-1",
  title: "Fix bug",
  description: null,
  url: "https://linear.app/acme/issue/ENG-1",
  priority: 2,
  state: { id: "state_1", name: "Todo" },
  assignee: null,
  team: { id: "team_1", name: "Engineering", key: "ENG" },
  project: null,
};

describe("createLinearIssue", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps issueCreate mutation success to the created issue", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: sampleIssue,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const result = await createLinearIssue("token", {
      teamId: "team_1",
      title: "Fix bug",
    });

    assert.equal(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assert.equal(result.value.identifier, "ENG-1");
      assert.equal(result.value.title, "Fix bug");
    }
  });

  it("returns an error when issueCreate reports success: false", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: false,
              issue: null,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const result = await createLinearIssue("token", {
      teamId: "team_1",
      title: "Fix bug",
    });

    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.match(result.error.message, /failed to create linear issue/i);
    }
  });
});

describe("deleteLinearWebhook", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns an error when webhookDelete reports success: false", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            webhookDelete: {
              success: false,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const result = await deleteLinearWebhook("token", "hook_1");

    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.match(result.error.message, /failed to delete linear webhook/i);
    }
  });
});
