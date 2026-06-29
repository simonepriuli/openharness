import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendInternalWorkflowRunEvents,
  createInternalWorkflowRunApiClient,
  fetchPendingCloudRuns,
} from "@openharness/workflow-executor";

describe("createCloudWorkflowExecutorDeps wiring", () => {
  it("internal API client calls source-control proxies", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL, _init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/git-credentials")) {
        return new Response(
          JSON.stringify({
            username: "x-access-token",
            token: "secret",
            remoteUrl: "https://github.com/acme/repo.git",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/context")) {
        return new Response(
          JSON.stringify({
            provider: "github",
            pullRequest: {
              number: 1,
              title: "Test",
              body: null,
              url: "https://github.com/acme/repo/pull/1",
              headRef: "feature",
              headSha: "abc",
            },
            diff: "",
            threads: [],
            issueComments: [],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };

    const client = createInternalWorkflowRunApiClient({
      baseUrl: "http://localhost:3001",
      secret: "secret",
      organizationId: "org-1",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await client.fetchGitCredentials("github", "acme", "repo");
    await client.fetchPrContext("github", "acme", "repo", 1);

    assert.equal(calls.length, 2);
    assert.match(calls[0], /organizationId=org-1/);
    assert.match(calls[1], /organizationId=org-1/);
  });

  it("fetchPendingCloudRuns uses global pending endpoint", async () => {
    let requestedUrl = "";
    const fetchImpl = async (input: string | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ runs: [] }), { status: 200 });
    };

    await fetchPendingCloudRuns({
      baseUrl: "http://localhost:3001",
      secret: "secret",
      fetchImpl: fetchImpl as typeof fetch,
    });

    assert.equal(requestedUrl, "http://localhost:3001/api/internal/workflow-runs/pending");
  });

  it("appendInternalWorkflowRunEvents posts batched events", async () => {
    let body = "";
    const fetchImpl = async (_input: string | URL, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await appendInternalWorkflowRunEvents({
      baseUrl: "http://localhost:3001",
      secret: "secret",
      organizationId: "org-1",
      runId: "run-1",
      events: [{ type: "message" }],
      fetchImpl: fetchImpl as typeof fetch,
    });

    assert.match(body, /"organizationId":"org-1"/);
    assert.match(body, /"events":\[/);
  });
});
