import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import * as actualFs from "node:fs";
import { Result } from "better-result";
import { allWorkflowTools, mockConfig } from "./helpers/fixtures.js";
import { importFresh } from "./helpers/import-fresh.js";

describe("env builders", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns empty env when no tools are enabled", async () => {
    const disabled = {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: false,
      linearRead: false,
      linearWrite: false,
      linearComments: false,
    };

    const { buildCloudGithubActionsEnv, buildWorkflowGithubActionsEnv } = await import(
      "../src/github-actions-env.js"
    );
    const { buildCloudWorkflowNotifyEnv, buildWorkflowNotifyEnv } = await import(
      "../src/workflow-notify-env.js"
    );
    const {
      buildCloudLinearActionsEnv,
      buildLinearAgentActionsEnv,
      buildWorkflowLinearActionsEnv,
    } = await import("../src/linear-actions-env.js");

    const config = mockConfig();
    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    assert.deepEqual(
      buildCloudGithubActionsEnv({
        baseUrl: "http://localhost:3001",
        secret: "secret",
        organizationId: "org-1",
        namespace: "acme",
        repo: "repo",
        enabledTools: [],
      }).value,
      {},
    );

    assert.deepEqual(
      buildCloudWorkflowNotifyEnv({
        baseUrl: "http://localhost:3001",
        secret: "secret",
        organizationId: "org-1",
        runId: "run-1",
        enabledTools: [],
      }).value,
      {},
    );

    assert.deepEqual(
      buildCloudLinearActionsEnv({
        baseUrl: "http://localhost:3001",
        secret: "secret",
        organizationId: "org-1",
        runId: "run-1",
        enabledTools: [],
      }).value,
      {},
    );

    assert.deepEqual(await buildWorkflowGithubActionsEnv(config, "org-1", run, disabled), {});
  });

  it("builds github, notify, and linear env payloads", async () => {
    const { buildCloudGithubActionsEnv, buildWorkflowGithubActionsEnv } = await import(
      "../src/github-actions-env.js"
    );
    const { buildCloudWorkflowNotifyEnv, buildWorkflowNotifyEnv } = await import(
      "../src/workflow-notify-env.js"
    );
    const {
      buildCloudLinearActionsEnv,
      buildLinearAgentActionsEnv,
      buildWorkflowLinearActionsEnv,
    } = await import("../src/linear-actions-env.js");

    const config = mockConfig();
    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    const github = buildCloudGithubActionsEnv({
      baseUrl: config.apiUrl,
      secret: config.secret,
      organizationId: "org-1",
      namespace: "acme",
      repo: "repo",
      prNumber: 7,
      enabledTools: ["approve_pull_request", "push_branch"],
    });
    assert.ok(Result.isOk(github));
    assert.equal(github.value.OPENHARNESS_SC_PR_NUMBER, "7");

    const notify = buildCloudWorkflowNotifyEnv({
      baseUrl: config.apiUrl,
      secret: config.secret,
      organizationId: "org-1",
      runId: "run-1",
      enabledTools: ["post_discord_message"],
    });
    assert.ok(Result.isOk(notify));

    const linearWorkflow = buildCloudLinearActionsEnv({
      baseUrl: config.apiUrl,
      secret: config.secret,
      organizationId: "org-1",
      runId: "run-1",
      enabledTools: ["get_linear_issue"],
    });
    assert.ok(Result.isOk(linearWorkflow));
    assert.equal(linearWorkflow.value.OPENHARNESS_WORKFLOW_RUN_ID, "run-1");

    const linearAgent = buildCloudLinearActionsEnv({
      baseUrl: config.apiUrl,
      secret: config.secret,
      organizationId: "org-1",
      runId: "agent-1",
      enabledTools: ["get_linear_issue"],
      linearAgentRun: true,
    });
    assert.equal(linearAgent.value.OPENHARNESS_LINEAR_AGENT_RUN_ID, "agent-1");

    const workflowGithub = await buildWorkflowGithubActionsEnv(
      config,
      "org-1",
      run,
      allWorkflowTools,
      3,
    );
    assert.ok(workflowGithub.OPENHARNESS_ENABLED_GITHUB_TOOLS);

    const workflowNotify = await buildWorkflowNotifyEnv(
      config,
      "org-1",
      run,
      allWorkflowTools,
      "run-1",
    );
    assert.ok(workflowNotify.OPENHARNESS_ENABLED_NOTIFY_TOOLS);

    const workflowLinear = await buildWorkflowLinearActionsEnv(
      config,
      "org-1",
      run,
      allWorkflowTools,
      "run-1",
    );
    assert.ok(workflowLinear.OPENHARNESS_ENABLED_LINEAR_TOOLS);

    const agentLinear = await buildLinearAgentActionsEnv(
      config,
      "org-1",
      allWorkflowTools,
      "agent-1",
    );
    assert.ok(agentLinear.OPENHARNESS_LINEAR_AGENT_RUN_ID);
  });

  it("builds github env from individual workflow tool toggles", async () => {
    const { buildWorkflowGithubActionsEnv } = await import("../src/github-actions-env.js");
    const config = mockConfig();
    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    const onlyComment = await buildWorkflowGithubActionsEnv(config, "org-1", run, {
      ...allWorkflowTools,
      prApprove: false,
      prPush: false,
      prCreate: false,
    });
    assert.match(String(onlyComment.OPENHARNESS_ENABLED_GITHUB_TOOLS), /submit_pull_request_review/);

    const onlyApprove = await buildWorkflowGithubActionsEnv(config, "org-1", run, {
      ...allWorkflowTools,
      prComment: false,
      prPush: false,
      prCreate: false,
    });
    assert.match(String(onlyApprove.OPENHARNESS_ENABLED_GITHUB_TOOLS), /approve_pull_request/);
  });

  it("builds notify and linear env from individual toggles", async () => {
    const { buildWorkflowNotifyEnv } = await import("../src/workflow-notify-env.js");
    const { buildWorkflowLinearActionsEnv } = await import("../src/linear-actions-env.js");
    const config = mockConfig();
    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    const teamsOnly = await buildWorkflowNotifyEnv(config, "org-1", run, {
      ...allWorkflowTools,
      discordNotify: false,
    }, "run-1");
    assert.match(String(teamsOnly.OPENHARNESS_ENABLED_NOTIFY_TOOLS), /post_teams_message/);

    const linearWriteOnly = await buildWorkflowLinearActionsEnv(config, "org-1", run, {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: false,
      linearRead: false,
      linearWrite: true,
      linearComments: false,
    }, "run-1");
    assert.match(String(linearWriteOnly.OPENHARNESS_ENABLED_LINEAR_TOOLS), /create_linear_issue/);
  });

  it("returns empty github env for non-github providers", async () => {
    const { buildWorkflowGithubActionsEnv } = await import("../src/github-actions-env.js");
    const config = mockConfig();
    const run = {
      provider: "azure_devops",
      namespace: "acme",
      repoName: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;
    const env = await buildWorkflowGithubActionsEnv(config, "org-1", run, allWorkflowTools);
    assert.deepEqual(env, {});
  });

  it("logs and returns empty env when file writes fail", async () => {
    mock.module("node:fs", {
      cache: false,
      namedExports: {
        ...actualFs,
        mkdirSync: () => {
          throw new Error("disk full");
        },
      },
    });

    const errorLog = mock.method(console, "error", () => undefined);
    const { buildWorkflowGithubActionsEnv } = await importFresh<
      typeof import("../src/github-actions-env.js")
    >("../src/github-actions-env.js");
    const { buildWorkflowNotifyEnv } = await importFresh<
      typeof import("../src/workflow-notify-env.js")
    >("../src/workflow-notify-env.js");
    const { buildWorkflowLinearActionsEnv, buildLinearAgentActionsEnv } = await importFresh<
      typeof import("../src/linear-actions-env.js")
    >("../src/linear-actions-env.js");
    const { buildCloudGithubActionsEnv } = await importFresh<
      typeof import("../src/github-actions-env.js")
    >("../src/github-actions-env.js");

    const config = mockConfig();
    const run = {
      provider: "github",
      namespace: "acme",
      repoName: "repo",
      githubOwner: "acme",
      githubRepo: "repo",
    } as import("@openharness/shared/workflow-run").WorkflowRunExecutionRecord;

    assert.deepEqual(
      await buildWorkflowGithubActionsEnv(config, "org-1", run, allWorkflowTools),
      {},
    );
    assert.deepEqual(
      await buildWorkflowNotifyEnv(config, "org-1", run, allWorkflowTools, "run-1"),
      {},
    );
    assert.deepEqual(
      await buildWorkflowLinearActionsEnv(config, "org-1", run, allWorkflowTools, "run-1"),
      {},
    );
    assert.deepEqual(
      await buildLinearAgentActionsEnv(config, "org-1", allWorkflowTools, "agent-1"),
      {},
    );

    assert.ok(
      Result.isError(
        buildCloudGithubActionsEnv({
          baseUrl: "http://localhost:3001",
          secret: "secret",
          organizationId: "org-1",
          namespace: "acme",
          repo: "repo",
          enabledTools: ["approve_pull_request"],
        }),
      ),
    );

    assert.ok(errorLog.mock.calls.length > 0);
    errorLog.mock.restore();
  });
});
