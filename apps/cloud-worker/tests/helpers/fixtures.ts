import type { CloudWorkerConfig } from "../../src/config.js";
import type { PendingCloudWorkflowRun } from "@openharness/workflow-executor";
import type { PendingLinearAgentRun } from "@openharness/workflow-executor";

export function mockConfig(overrides: Partial<CloudWorkerConfig> = {}): CloudWorkerConfig {
  return {
    apiUrl: "http://127.0.0.1:3001",
    secret: "test-secret",
    workerId: "worker-test",
    sandboxName: null,
    reposRoot: "/tmp/openharness/repos-test",
    worktreesRoot: "/tmp/openharness/worktrees-test",
    openHarnessRoot: null,
    piAgentRoot: "/tmp/openharness/pi-test",
    githubActionsExtensionDir: "/tmp/ext/github-actions",
    workflowNotifyExtensionDir: "/tmp/ext/workflow-notify",
    linearActionsExtensionDir: "/tmp/ext/linear-actions",
    summarizationModelRef: "openrouter/test-model",
    ...overrides,
  };
}

export function mockPendingRun(
  overrides: Partial<PendingCloudWorkflowRun> = {},
): PendingCloudWorkflowRun {
  return {
    id: "run-1",
    organizationId: "org-1",
    workflowId: "wf-1",
    workflowType: null,
    projectSourceControlConnectionId: "conn-1",
    provider: "github",
    namespace: "acme",
    repoName: "repo",
    prNumber: 1,
    event: "pull_request",
    iteration: 1,
    payload: {},
    resolvedExecutor: "cloud",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockPendingLinearAgentRun(
  overrides: Partial<PendingLinearAgentRun> = {},
): PendingLinearAgentRun {
  return {
    id: "agent-run-1",
    organizationId: "org-1",
    projectSourceControlConnectionId: "conn-1",
    provider: "github",
    namespace: "acme",
    repoName: "repo",
    linearIssueId: "issue-1",
    trigger: "mention",
    status: "pending",
    payload: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as PendingLinearAgentRun;
}

export const allWorkflowTools = {
  prComment: true,
  prApprove: true,
  prPush: true,
  prCreate: true,
  teamsNotify: true,
  discordNotify: true,
  linearRead: true,
  linearWrite: true,
  linearComments: true,
};
