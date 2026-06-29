import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeWorkflowRun } from "./execute-workflow-run.js";
import type { WorkflowExecutorDeps } from "./deps.js";

describe("executeWorkflowRun", () => {
  it("marks non-git project paths as failed", async () => {
    const statuses: Array<{ status: string; fields?: Record<string, unknown> }> = [];
    const deps: WorkflowExecutorDeps = {
      api: {
        async getRun(runId) {
          return {
            run: {
              id: runId,
              workflowId: null,
              projectPath: "/repo",
              githubOwner: "acme",
              githubRepo: "app",
              prNumber: 0,
              event: "manual",
              iteration: 1,
              payload: { branch: "main" },
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            workflowConfig: null,
          };
        },
        async updateStatus(runId, status, fields) {
          statuses.push({ status, fields });
        },
        async fetchPrContext() {
          throw new Error("not expected");
        },
        async fetchGitCredentials() {
          throw new Error("not expected");
        },
      },
      git: {
        async isGitRepository() {
          return false;
        },
        async preparePrWorktree() {
          throw new Error("not expected");
        },
        async prepareBranchWorktree() {
          throw new Error("not expected");
        },
      },
      pi: {
        async run() {
          throw new Error("not expected");
        },
      },
      events: {
        append() {},
        snapshotMessages() {
          return [];
        },
      },
      secrets: {
        async buildGithubActionsEnv() {
          return {};
        },
        resolveSummarizationModelRef() {
          return "";
        },
      },
      worktreesRoot: "/tmp/worktrees",
      projectPath: "/repo",
    };

    await executeWorkflowRun("run-1", deps);
    assert.deepEqual(statuses, [
      {
        status: "failed",
        fields: {
          errorMessage: "Connected project folder is missing or not a git repository",
        },
      },
    ]);
  });

  it("runs scheduled workflows on branch worktrees", async () => {
    const statuses: string[] = [];
    let prompt = "";
    const deps: WorkflowExecutorDeps = {
      api: {
        async getRun(runId) {
          return {
            run: {
              id: runId,
              workflowId: "wf-1",
              projectPath: "/repo",
              provider: "github",
              namespace: "acme",
              repoName: "app",
              githubOwner: "acme",
              githubRepo: "app",
              prNumber: 0,
              event: "manual",
              iteration: 1,
              payload: { branch: "main", workflow: { id: "wf-1", name: "Scan", model: "openai/gpt-4.1-mini", instructions: "scan", tools: { prComment: false, prApprove: false, prPush: false, prCreate: false, teamsNotify: false }, triggerEvent: "manual" } },
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            workflowConfig: null,
          };
        },
        async updateStatus(_runId, status) {
          statuses.push(status);
        },
        async fetchPrContext() {
          throw new Error("not expected");
        },
        async fetchGitCredentials() {
          return { username: "x", token: "y", remoteUrl: "https://github.com/acme/app.git" };
        },
      },
      git: {
        async isGitRepository() {
          return true;
        },
        async preparePrWorktree() {
          throw new Error("not expected");
        },
        async prepareBranchWorktree() {
          return { worktreePath: "/tmp/worktrees/acme-app/branch-main", branchName: "openharness/branch-main" };
        },
      },
      pi: {
        async run(options) {
          prompt = options.prompt;
          return { messages: [], assistantText: "Scan complete." };
        },
      },
      events: {
        append() {},
        snapshotMessages() {
          return [];
        },
      },
      secrets: {
        async buildGithubActionsEnv() {
          return {};
        },
        resolveSummarizationModelRef() {
          return "";
        },
      },
      worktreesRoot: "/tmp/worktrees",
      projectPath: "/repo",
    };

    await executeWorkflowRun("run-1", deps);
    assert.deepEqual(statuses, ["running", "done"]);
    assert.match(prompt, /Branch: main/);
  });
});
