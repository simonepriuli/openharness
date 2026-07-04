import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import * as actualFs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Result } from "better-result";
import {
  cleanupCloudLinearAgentPiDir,
  cleanupCloudPiAgentDir,
  createCloudWorkflowExecutorDeps,
  resolveCloudOrgSecrets,
} from "../src/executor-adapters.js";
import { allWorkflowTools, mockConfig } from "./helpers/fixtures.js";
import { writeAllExtensionTemplates } from "./helpers/extension-templates.js";

describe("executor adapters", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("resolves org secrets and builds workflow executor deps", async () => {
    const config = mockConfig({
      piAgentRoot: join(tmpdir(), `pi-${process.pid}`),
      githubActionsExtensionDir: join(tmpdir(), `gha-${process.pid}`),
      workflowNotifyExtensionDir: join(tmpdir(), `notify-${process.pid}`),
      linearActionsExtensionDir: join(tmpdir(), `linear-${process.pid}`),
    });
    mkdirSync(config.githubActionsExtensionDir, { recursive: true });
    mkdirSync(config.workflowNotifyExtensionDir, { recursive: true });
    mkdirSync(config.linearActionsExtensionDir, { recursive: true });
    writeAllExtensionTemplates(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/org-secrets/resolve")) {
        return Response.json({ secrets: [] });
      }
      if (url.includes("/repo-environments/resolve")) {
        return Response.json({ vars: { FOO: "bar" } });
      }
      if (url.includes("/events")) {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    }) as typeof fetch;

    const secretsResult = await resolveCloudOrgSecrets(config, "org-1");
    assert.ok(Result.isOk(secretsResult));

    const deps = await createCloudWorkflowExecutorDeps({
      config,
      organizationId: "org-1",
      runId: "run-1",
      connectionId: "conn-1",
      projectPath: "/repo",
      worktreesRoot: join(tmpdir(), `wt-${process.pid}`),
      orgSecrets: [],
    });

    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    const githubEnv = await deps.secrets.buildGithubActionsEnv(run, allWorkflowTools, 1);
    assert.ok(githubEnv);

    const notifyEnv = await deps.secrets.buildWorkflowNotifyEnv(run, allWorkflowTools, "run-1");
    assert.ok(notifyEnv);

    const linearEnv = await deps.secrets.buildLinearActionsEnv(run, allWorkflowTools, "run-1");
    assert.ok(linearEnv);

    assert.equal(deps.secrets.resolveSummarizationModelRef(), config.summarizationModelRef);

    const repoEnv = await deps.secrets.buildPiProcessEnv();
    assert.ok(repoEnv);

    deps.events.append({ type: "message" });
    await deps.events.flush?.();

    globalThis.fetch = mock.fn(async () =>
      Response.json({ error: "fail" }, { status: 500 }),
    ) as typeof fetch;
    const failedRepoEnv = await deps.secrets.buildPiProcessEnv();
    assert.deepEqual(failedRepoEnv, {});

    const noConnectionDeps = await createCloudWorkflowExecutorDeps({
      config,
      organizationId: "org-1",
      runId: "run-2",
      connectionId: "",
      projectPath: "/repo",
      worktreesRoot: join(tmpdir(), `wt2-${process.pid}`),
      orgSecrets: [],
    });
    assert.deepEqual(await noConnectionDeps.secrets.buildPiProcessEnv(), {});

    globalThis.fetch = originalFetch;
    rmSync(config.piAgentRoot, { recursive: true, force: true });
  });

  it("cleans up pi directories", async () => {
    const config = mockConfig({
      piAgentRoot: join(tmpdir(), `pi-clean-${process.pid}`),
    });
    mkdirSync(join(config.piAgentRoot, "run-1"), { recursive: true });
    mkdirSync(join(config.piAgentRoot, "agent-run-1"), { recursive: true });

    cleanupCloudPiAgentDir(config, "run-1");
    cleanupCloudLinearAgentPiDir(config, "agent-run-1", "issue-1");
    cleanupCloudLinearAgentPiDir(config, "agent-run-1", null);

    mock.module("node:fs", {
      cache: false,
      namedExports: {
        ...actualFs,
        rmSync: () => {
          throw new Error("locked");
        },
      },
    });
    const {
      cleanupCloudPiAgentDir: cleanupWithMock,
      cleanupCloudLinearAgentPiDir: cleanupLinearWithMock,
    } = await import("../src/executor-adapters.js");
    cleanupWithMock(config, "missing");
    cleanupLinearWithMock(config, "missing", null);
  });

  it("wraps org secret resolution failures", async () => {
    const config = mockConfig();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () =>
      Response.json({ error: "fail" }, { status: 500 }),
    ) as typeof fetch;

    const result = await resolveCloudOrgSecrets(config, "org-1");
    assert.ok(Result.isError(result));
    globalThis.fetch = originalFetch;
  });
});

describe("workflow-executor API wiring", () => {
  it("internal API client calls source-control proxies", async () => {
    const {
      createInternalWorkflowRunApiClient,
      fetchPendingCloudRuns,
      appendInternalWorkflowRunEvents,
    } = await import("@openharness/workflow-executor");

    const calls: string[] = [];
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/git-credentials")) {
        return Response.json({
          username: "x-access-token",
          token: "secret",
          remoteUrl: "https://github.com/acme/repo.git",
        });
      }
      if (url.includes("/context")) {
        return Response.json({
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
        });
      }
      return Response.json({ error: "not found" }, { status: 404 });
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

    let requestedUrl = "";
    await fetchPendingCloudRuns({
      baseUrl: "http://localhost:3001",
      secret: "secret",
      fetchImpl: (async (input: string | URL) => {
        requestedUrl = String(input);
        return Response.json({ runs: [] });
      }) as typeof fetch,
    });
    assert.equal(requestedUrl, "http://localhost:3001/api/internal/workflow-runs/pending");

    let body = "";
    await appendInternalWorkflowRunEvents({
      baseUrl: "http://localhost:3001",
      secret: "secret",
      organizationId: "org-1",
      runId: "run-1",
      events: [{ type: "message" }],
      fetchImpl: (async (_input: string | URL, init?: RequestInit) => {
        body = String(init?.body ?? "");
        return Response.json({ ok: true });
      }) as typeof fetch,
    });
    assert.match(body, /"organizationId":"org-1"/);
  });
});
