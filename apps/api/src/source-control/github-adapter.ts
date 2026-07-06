import { createDb } from "@openharness/db";
import { Result } from "better-result";
import { env, hasGithubApp } from "../env.js";
import { githubAppBotLogin } from "../github/workflow-constants.js";
import { findRepoInOrgInstallations } from "../github/sync.js";
import { registerSourceControlProvider } from "./registry.js";
import type { ProviderConnectionStatus, SourceControlProviderAdapter } from "./types.js";
import { GithubApiError } from "../errors.js";
import {
  githubCreateInlineComment,
  githubCreatePullRequest,
  githubFetchGitCredentials,
  githubFetchPrContext,
  githubPostIssueComment,
  githubReplyToThread,
  githubResolveThread,
  githubSubmitReview,
} from "./github-pr-service.js";
import { listOrgAccessibleRepos, listRepoBranches } from "../github/sync.js";

const db = createDb(env.databaseUrl());

function repoNotAccessibleError(): GithubApiError {
  return new GithubApiError({ message: "repo_not_accessible", status: 403 });
}

async function resolveInstallationId(
  organizationId: string,
  owner: string,
  repo: string,
): Promise<Result<string, GithubApiError>> {
  const record = await findRepoInOrgInstallations(db, organizationId, owner, repo);
  if (!record?.installationId) return Result.err(repoNotAccessibleError());
  return Result.ok(record.installationId);
}

async function withInstallationId<T>(
  organizationId: string,
  namespace: string,
  repoName: string,
  fn: (installationId: string) => Promise<Result<T, GithubApiError>>,
): Promise<Result<T, GithubApiError>> {
  const installationResult = await resolveInstallationId(organizationId, namespace, repoName);
  if (Result.isError(installationResult)) return installationResult;
  return fn(installationResult.value);
}

export const githubSourceControlAdapter: SourceControlProviderAdapter = {
  provider: "github",

  async getStatus(organizationId: string): Promise<ProviderConnectionStatus> {
    if (!hasGithubApp()) {
      return {
        configured: false,
        connected: false,
        agentReady: false,
        connections: [],
      };
    }

    const { getOrgInstallations } = await import("../github/sync.js");
    const installations = await getOrgInstallations(db, organizationId);
    const agentReady = installations.some((inst) => inst.repoCount > 0);

    return {
      configured: true,
      connected: installations.length > 0,
      agentReady,
      connections: installations.map((inst) => ({
        connectionId: inst.connectionId,
        displayName: inst.accountLogin,
        externalOrgId: inst.installationId,
        repoCount: inst.repoCount,
        metadata: {
          accountType: inst.accountType,
          repositorySelection: inst.repositorySelection,
        },
      })),
    };
  },

  async listAccessibleRepos(organizationId, options) {
    const result = await listOrgAccessibleRepos(
      db,
      organizationId,
      options?.query,
      options?.page,
      options?.perPage,
      "github",
    );
    return {
      ...result,
      repos: result.repos.map((repo) => ({
        provider: "github" as const,
        externalRepoId: repo.externalRepoId,
        namespace: repo.namespace,
        name: repo.name,
        fullName: repo.fullName,
        connectionId: repo.connectionId,
        installationId: repo.installationId,
      })),
    };
  },

  async listBranches(organizationId, namespace, name) {
    return Result.tryPromise({
      try: () => listRepoBranches(db, organizationId, namespace, name),
      catch: (cause) => {
        if (GithubApiError.is(cause)) return cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        return new GithubApiError({
          message,
          status: message === "repo_not_accessible" ? 403 : undefined,
          cause,
        });
      },
    });
  },

  normalizeWebhookEvent() {
    return null;
  },

  async getAutomationIdentity() {
    const login = githubAppBotLogin(env.githubAppSlug());
    if (!login) return null;
    return { kind: "github_bot", login };
  },

  normalizeWorkflowTriggerInput() {
    return null;
  },

  async enrichRunPayload(_organizationId, event) {
    return event.payload;
  },

  async fetchPrContext(organizationId, namespace, repoName, prNumber) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubFetchPrContext(installationId, namespace, repoName, prNumber),
    );
  },

  async fetchGitCredentials(organizationId, namespace, repoName) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubFetchGitCredentials(installationId, namespace, repoName),
    );
  },

  async submitReview(organizationId, namespace, repoName, prNumber, input) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubSubmitReview(installationId, namespace, repoName, prNumber, input),
    );
  },

  async createInlineComment(organizationId, namespace, repoName, prNumber, input) {
    if (!input.commitId) {
      return Result.err(
        new GithubApiError({ message: "commitId is required for GitHub inline comments" }),
      );
    }
    const commitId = input.commitId;
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubCreateInlineComment(installationId, namespace, repoName, prNumber, {
        body: input.body,
        path: input.path,
        line: input.line,
        side: input.side,
        commitId,
      }),
    );
  },

  async replyToThread(organizationId, namespace, repoName, prNumber, threadId, body) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubReplyToThread(installationId, namespace, repoName, prNumber, threadId, body),
    );
  },

  async resolveThread(organizationId, namespace, repoName, _prNumber, threadId) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubResolveThread(installationId, threadId),
    );
  },

  async postIssueComment(organizationId, namespace, repoName, prNumber, body) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubPostIssueComment(installationId, namespace, repoName, prNumber, body),
    );
  },

  async createPullRequest(organizationId, namespace, repoName, input) {
    return withInstallationId(organizationId, namespace, repoName, (installationId) =>
      githubCreatePullRequest(installationId, namespace, repoName, input),
    );
  },

  async commentOnPr({ organizationId, namespace, repoName, prNumber, body }) {
    return this.postIssueComment(organizationId, namespace, repoName, prNumber, body);
  },

  async approvePr({ organizationId, namespace, repoName, prNumber }) {
    return this.submitReview(organizationId, namespace, repoName, prNumber, {
      event: "APPROVE",
      body: "",
    });
  },

  async provisionHooks() {
    return Result.ok(undefined);
  },

  async deprovisionHooks() {
    return Result.ok(undefined);
  },
};

export function registerGithubSourceControlProvider(): void {
  registerSourceControlProvider(githubSourceControlAdapter);
}

export async function resolveGithubInstallationId(
  organizationId: string,
  namespace: string,
  repoName: string,
): Promise<string | null> {
  const record = await findRepoInOrgInstallations(db, organizationId, namespace, repoName);
  return record?.installationId ?? null;
}
