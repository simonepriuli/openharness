import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { WorkflowRunExecutionRecord, WorkflowTools } from "@openharness/shared/workflow-run";
import type { CloudWorkerConfig } from "./config.js";

const GITHUB_ACTION_TOOL_NAMES = [
  "approve_pull_request",
  "submit_pull_request_review",
  "create_pull_request",
  "push_branch",
] as const;

type GithubActionToolName = (typeof GITHUB_ACTION_TOOL_NAMES)[number];

function enabledToolsFromWorkflowToggles(tools: WorkflowTools): GithubActionToolName[] {
  const enabled: GithubActionToolName[] = [];
  if (tools.prApprove) enabled.push("approve_pull_request");
  if (tools.prComment) enabled.push("submit_pull_request_review");
  if (tools.prCreate) enabled.push("create_pull_request");
  if (tools.prPush) enabled.push("push_branch");
  return enabled;
}

export function buildCloudGithubActionsEnv(options: {
  baseUrl: string;
  secret: string;
  organizationId: string;
  namespace: string;
  repo: string;
  prNumber?: number;
  enabledTools: GithubActionToolName[];
}): NodeJS.ProcessEnv {
  if (options.enabledTools.length === 0) {
    return {};
  }

  mkdirSync(join(tmpdir(), "openharness-github-actions"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-github-actions", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      kind: "cloud_worker",
      baseUrl: options.baseUrl,
      secret: options.secret,
      organizationId: options.organizationId,
    }),
    "utf8",
  );

  return {
    OPENHARNESS_SC_NAMESPACE: options.namespace,
    OPENHARNESS_SC_REPO: options.repo,
    OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_GITHUB_TOOLS: options.enabledTools.join(","),
    ...(options.prNumber ? { OPENHARNESS_SC_PR_NUMBER: String(options.prNumber) } : {}),
  };
}

export async function buildWorkflowGithubActionsEnv(
  config: CloudWorkerConfig,
  organizationId: string,
  run: WorkflowRunExecutionRecord,
  tools: WorkflowTools,
  prNumber?: number,
): Promise<NodeJS.ProcessEnv> {
  const provider = run.provider ?? "github";
  if (provider !== "github") return {};
  const enabledTools = enabledToolsFromWorkflowToggles(tools);
  if (enabledTools.length === 0) return {};
  return buildCloudGithubActionsEnv({
    baseUrl: config.apiUrl,
    secret: config.secret,
    organizationId,
    namespace: run.namespace ?? run.githubOwner,
    repo: run.repoName ?? run.githubRepo,
    prNumber,
    enabledTools,
  });
}
