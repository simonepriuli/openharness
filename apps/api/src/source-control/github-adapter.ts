import { createDb } from "@openharness/db";
import { env, hasGithubApp } from "../env.js";
import { githubAppBotLogin } from "../github/workflow-constants.js";
import { findRepoInOrgInstallations } from "../github/sync.js";
import { registerSourceControlProvider } from "./registry.js";
import type { ProviderConnectionStatus, SourceControlProviderAdapter } from "./types.js";
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

async function resolveInstallationId(
  organizationId: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const record = await findRepoInOrgInstallations(db, organizationId, owner, repo);
  return record?.installationId ?? null;
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
    return listRepoBranches(db, organizationId, namespace, name);
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
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    return githubFetchPrContext(installationId, namespace, repoName, prNumber);
  },

  async fetchGitCredentials(organizationId, namespace, repoName) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    return githubFetchGitCredentials(installationId, namespace, repoName);
  },

  async submitReview(organizationId, namespace, repoName, prNumber, input) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    await githubSubmitReview(installationId, namespace, repoName, prNumber, input);
  },

  async createInlineComment(organizationId, namespace, repoName, prNumber, input) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    if (!input.commitId) throw new Error("commitId is required for GitHub inline comments");
    await githubCreateInlineComment(installationId, namespace, repoName, prNumber, {
      ...input,
      commitId: input.commitId,
    });
  },

  async replyToThread(organizationId, namespace, repoName, prNumber, threadId, body) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    await githubReplyToThread(installationId, namespace, repoName, prNumber, threadId, body);
  },

  async resolveThread(organizationId, namespace, repoName, _prNumber, threadId) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    await githubResolveThread(installationId, threadId);
  },

  async postIssueComment(organizationId, namespace, repoName, prNumber, body) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    await githubPostIssueComment(installationId, namespace, repoName, prNumber, body);
  },

  async createPullRequest(organizationId, namespace, repoName, input) {
    const installationId = await resolveInstallationId(organizationId, namespace, repoName);
    if (!installationId) throw new Error("repo_not_accessible");
    return githubCreatePullRequest(installationId, namespace, repoName, input);
  },

  async commentOnPr({ organizationId, namespace, repoName, prNumber, body }) {
    await this.postIssueComment(organizationId, namespace, repoName, prNumber, body);
  },

  async approvePr({ organizationId, namespace, repoName, prNumber }) {
    await this.submitReview(organizationId, namespace, repoName, prNumber, {
      event: "APPROVE",
      body: "",
    });
  },

  async provisionHooks() {},

  async deprovisionHooks() {},
};

export function registerGithubSourceControlProvider(): void {
  registerSourceControlProvider(githubSourceControlAdapter);
}

export async function resolveGithubInstallationId(
  organizationId: string,
  namespace: string,
  repoName: string,
): Promise<string | null> {
  return resolveInstallationId(organizationId, namespace, repoName);
}
