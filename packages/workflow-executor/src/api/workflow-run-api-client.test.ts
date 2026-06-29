import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInternalWorkflowRunApiClient,
  resolveRepoEnvironmentVariables,
} from "../api/workflow-run-api-client.js";

describe("createInternalWorkflowRunApiClient", () => {
  it("fetches a run for execution", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createInternalWorkflowRunApiClient({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            run: {
              id: "run-1",
              workflowId: "wf-1",
              workflowType: null,
              projectPath: "/repo",
              provider: "github",
              namespace: "acme",
              repoName: "app",
              prNumber: 0,
              event: "manual",
              iteration: 1,
              payload: { workflow: { id: "wf-1", name: "Test", model: "", instructions: "", tools: {}, triggerEvent: "manual" } },
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 200 },
        );
      },
    });

    const context = await client.getRun("run-1");
    assert.equal(context.run.id, "run-1");
    assert.equal(context.workflowConfig?.name, "Test");
    assert.match(calls[0]!.url, /\/api\/internal\/workflow-runs\/run-1\?organizationId=org-1/);
  });

  it("posts status updates with bearer auth", async () => {
    let authHeader = "";
    const client = createInternalWorkflowRunApiClient({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      fetchImpl: async (_url, init) => {
        authHeader = String(
          (init?.headers as Record<string, string> | undefined)?.authorization ?? "",
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    await client.updateStatus("run-1", "running");
    assert.equal(authHeader, "Bearer worker-secret");
  });
});

describe("resolveRepoEnvironmentVariables", () => {
  it("resolves repo environment variables", async () => {
    const vars = await resolveRepoEnvironmentVariables({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      connectionId: "conn-1",
      fetchImpl: async () =>
        new Response(JSON.stringify({ vars: { API_KEY: "secret" } }), { status: 200 }),
    });

    assert.deepEqual(vars, { API_KEY: "secret" });
  });
});
