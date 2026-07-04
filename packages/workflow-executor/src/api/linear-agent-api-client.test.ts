import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendInternalLinearAgentRunEvents,
  createInternalLinearAgentRunApiClient,
} from "./linear-agent-api-client.js";

describe("createInternalLinearAgentRunApiClient", () => {
  it("fetches git credentials from the internal source-control route", async () => {
    let url = "";
    const client = createInternalLinearAgentRunApiClient({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      fetchImpl: async (requestUrl) => {
        url = String(requestUrl);
        return new Response(
          JSON.stringify({
            username: "x-access-token",
            token: "ghs_test",
            remoteUrl: "https://github.com/acme/app.git",
          }),
          { status: 200 },
        );
      },
    });

    const credentials = await client.fetchGitCredentials("github", "acme", "app");
    assert.equal(credentials.token, "ghs_test");
    assert.equal(
      url,
      "https://api.example.com/api/internal/source-control/pr/github/acme/app/git-credentials?organizationId=org-1",
    );
  });

  it("posts activities to the internal linear agent activities route", async () => {
    let url = "";
    let body = "";
    const client = createInternalLinearAgentRunApiClient({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      fetchImpl: async (requestUrl, init) => {
        url = String(requestUrl);
        body = String(init?.body ?? "");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    await client.emitActivity(
      "run-1",
      { type: "thought", body: "Still working…" },
      true,
    );

    assert.equal(
      url,
      "https://api.example.com/api/internal/linear-agent-runs/run-1/activities",
    );
    assert.deepEqual(JSON.parse(body), {
      organizationId: "org-1",
      content: { type: "thought", body: "Still working…" },
      ephemeral: true,
    });
  });
});

describe("appendInternalLinearAgentRunEvents", () => {
  it("posts events to the internal linear agent events route", async () => {
    let url = "";
    let body = "";
    await appendInternalLinearAgentRunEvents({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      runId: "run-1",
      events: [{ type: "tool_execution_start", toolName: "read" }],
      fetchImpl: async (requestUrl, init) => {
        url = String(requestUrl);
        body = String(init?.body ?? "");
        return new Response(JSON.stringify({ appended: 1, lastSeq: 1 }), { status: 200 });
      },
    });

    assert.equal(url, "https://api.example.com/api/internal/linear-agent-runs/run-1/events");
    assert.deepEqual(JSON.parse(body), {
      organizationId: "org-1",
      events: [{ type: "tool_execution_start", toolName: "read" }],
    });
  });
});
