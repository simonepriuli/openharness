import { readFileSync } from "node:fs";

export type GithubActionsAuth = {
  baseUrl: string;
  cookie: string;
  sessionToken: string;
};

export type GithubActionsConfig = {
  namespace: string;
  repo: string;
  prNumber?: number;
  enabledTools: Set<string>;
  auth: GithubActionsAuth;
};

export function readGithubActionsConfig(): GithubActionsConfig | null {
  const namespace = process.env.OPENHARNESS_SC_NAMESPACE?.trim();
  const repo = process.env.OPENHARNESS_SC_REPO?.trim();
  const authFile = process.env.OPENHARNESS_GITHUB_ACTIONS_AUTH_FILE?.trim();
  const enabledRaw = process.env.OPENHARNESS_ENABLED_GITHUB_TOOLS?.trim();
  if (!namespace || !repo || !authFile || !enabledRaw) return null;

  let auth: GithubActionsAuth;
  try {
    auth = JSON.parse(readFileSync(authFile, "utf8")) as GithubActionsAuth;
  } catch {
    return null;
  }
  if (!auth.baseUrl || !auth.cookie || !auth.sessionToken) return null;

  const enabledTools = new Set(
    enabledRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  if (enabledTools.size === 0) return null;

  const prRaw = process.env.OPENHARNESS_SC_PR_NUMBER?.trim();
  const prNumber = prRaw ? Number.parseInt(prRaw, 10) : undefined;

  return {
    namespace,
    repo,
    prNumber: Number.isFinite(prNumber) ? prNumber : undefined,
    enabledTools,
    auth,
  };
}
