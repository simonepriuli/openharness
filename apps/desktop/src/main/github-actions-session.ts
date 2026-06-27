import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getGitRemoteInfo } from "./git-remote.js";
import { getApiBaseUrl } from "./auth-config.js";
import { getExtensionApiAuth, listOrgGithubConnections } from "./openharness-api.js";
import { GITHUB_ACTION_TOOL_NAMES, type GithubActionToolName } from "./github-actions-mappings.js";

export {
  enabledToolsFromWorkflowToggles,
  githubActionToolForWorkflowToolId,
  GITHUB_ACTION_TOOL_NAMES,
  type GithubActionToolName,
  workflowToolIdForGithubAction,
} from "./github-actions-mappings.js";

export type LinkedGithubRepo = {
  namespace: string;
  repo: string;
};

const authFiles = new Set<string>();

export async function resolveLinkedGithubRepoForCwd(
  cwd: string,
): Promise<LinkedGithubRepo | null> {
  const remote = await getGitRemoteInfo(cwd);
  if (remote.provider !== "github" || !remote.namespace || !remote.repo) {
    return null;
  }

  const { connections } = await listOrgGithubConnections();
  const match = connections.find(
    (row) =>
      (row.provider ?? "github") === "github" &&
      row.githubOwner.toLowerCase() === remote.namespace!.toLowerCase() &&
      row.githubRepo.toLowerCase() === remote.repo!.toLowerCase(),
  );
  if (!match) return null;

  return { namespace: remote.namespace, repo: remote.repo };
}

export async function buildGithubActionsEnv(options: {
  namespace: string;
  repo: string;
  prNumber?: number;
  enabledTools: GithubActionToolName[];
}): Promise<NodeJS.ProcessEnv> {
  if (options.enabledTools.length === 0) {
    return {};
  }

  const auth = await getExtensionApiAuth();
  mkdirSync(join(tmpdir(), "openharness-github-actions"), { recursive: true });
  const authFile = join(tmpdir(), "openharness-github-actions", `${randomUUID()}.json`);
  writeFileSync(
    authFile,
    JSON.stringify({
      baseUrl: getApiBaseUrl(),
      cookie: auth.cookie,
      sessionToken: auth.sessionToken,
    }),
    "utf8",
  );
  authFiles.add(authFile);

  return {
    OPENHARNESS_SC_NAMESPACE: options.namespace,
    OPENHARNESS_SC_REPO: options.repo,
    OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE: authFile,
    OPENHARNESS_ENABLED_GITHUB_TOOLS: options.enabledTools.join(","),
    ...(options.prNumber ? { OPENHARNESS_SC_PR_NUMBER: String(options.prNumber) } : {}),
  };
}

export async function buildGithubActionsEnvForCwd(
  cwd: string,
  prNumber?: number,
): Promise<NodeJS.ProcessEnv> {
  const linked = await resolveLinkedGithubRepoForCwd(cwd);
  if (!linked) return {};
  return buildGithubActionsEnv({
    namespace: linked.namespace,
    repo: linked.repo,
    prNumber,
    enabledTools: [...GITHUB_ACTION_TOOL_NAMES],
  });
}

export function cleanupGithubActionsAuthFiles(): void {
  for (const file of authFiles) {
    try {
      rmSync(file, { force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  authFiles.clear();
}

export function releaseGithubActionsAuthFile(env: NodeJS.ProcessEnv | undefined): void {
  const file = env?.OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE;
  if (!file) return;
  try {
    rmSync(file, { force: true });
  } catch {
    // ignore cleanup errors
  }
  authFiles.delete(file);
}
