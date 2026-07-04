import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mockConfig } from "./helpers/fixtures.js";
import { writeAllExtensionTemplates } from "./helpers/extension-templates.js";

describe("createCloudLinearAgentExecutorDeps", () => {
  it("builds linear agent deps and secret callbacks", async () => {
    const config = mockConfig({
      piAgentRoot: join(tmpdir(), `pi-linear-${process.pid}`),
      githubActionsExtensionDir: join(tmpdir(), `gha-linear-${process.pid}`),
      workflowNotifyExtensionDir: join(tmpdir(), `notify-linear-${process.pid}`),
      linearActionsExtensionDir: join(tmpdir(), `linear-ext-${process.pid}`),
    });
    mkdirSync(config.githubActionsExtensionDir, { recursive: true });
    mkdirSync(config.workflowNotifyExtensionDir, { recursive: true });
    mkdirSync(config.linearActionsExtensionDir, { recursive: true });
    writeAllExtensionTemplates(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => Response.json({ ok: true })) as typeof fetch;

    const { createCloudLinearAgentExecutorDeps } = await import(
      "../src/executor-adapters-linear-agent.js"
    );
    const deps = await createCloudLinearAgentExecutorDeps({
      config,
      organizationId: "org-1",
      runId: "run-1",
      linearIssueId: "issue-1",
      connectionId: "conn-1",
      orgSecrets: [],
      workspaceMode: "reuse",
    });

    assert.ok(deps.piAgentDir.includes("issue-1"));
    const run = {
      trigger: "mention",
      namespace: "acme",
      repoName: "repo",
    } as import("@openharness/workflow-executor").LinearAgentRunExecutionRecord;

    await deps.secrets.buildGithubActionsEnv?.(run);
    await deps.secrets.buildLinearActionsEnv?.(run, undefined, "run-1");
    assert.equal(deps.secrets.resolveSummarizationModelRef?.(), config.summarizationModelRef);
    assert.deepEqual(await deps.secrets.buildPiProcessEnv?.(), {});
    await deps.events.append?.({ type: "message" });

    const noIssueDeps = await createCloudLinearAgentExecutorDeps({
      config,
      organizationId: "org-1",
      runId: "run-2",
      linearIssueId: null,
      connectionId: "",
      orgSecrets: [],
    });
    assert.ok(noIssueDeps.piAgentDir.includes("agent-run-2"));
    assert.deepEqual(await noIssueDeps.secrets.buildPiProcessEnv?.(), {});

    globalThis.fetch = originalFetch;
    rmSync(config.piAgentRoot, { recursive: true, force: true });
  });
});
