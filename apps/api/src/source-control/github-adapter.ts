import { createDb } from "@openharness/db";
import { env, hasGithubApp } from "../env.js";
import { githubAppFetch } from "../github/app-auth.js";
import {
  findRepoInOrgInstallations,
  getOrgInstallations,
  listOrgAccessibleRepos,
  listRepoBranches,
} from "../github/sync.js";
import { registerSourceControlProvider } from "../source-control/registry.js";
import type {
  ProviderConnectionStatus,
  SourceControlProviderAdapter,
} from "../source-control/types.js";

const db = createDb(env.databaseUrl());

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

  async commentOnPr({ organizationId, namespace, repoName, prNumber, body }) {
    const repoRecord = await findRepoInOrgInstallations(db, organizationId, namespace, repoName);
    if (!repoRecord) throw new Error("repo_not_accessible");

    const response = await githubAppFetch(
      `/repos/${namespace}/${repoName}/issues/${prNumber}/comments`,
      {
        installationId: repoRecord.installationId,
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to comment on PR: ${response.status} ${text}`);
    }
  },

  async approvePr({ organizationId, namespace, repoName, prNumber }) {
    const repoRecord = await findRepoInOrgInstallations(db, organizationId, namespace, repoName);
    if (!repoRecord) throw new Error("repo_not_accessible");

    const response = await githubAppFetch(
      `/repos/${namespace}/${repoName}/pulls/${prNumber}/reviews`,
      {
        installationId: repoRecord.installationId,
        method: "POST",
        body: JSON.stringify({ event: "APPROVE" }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to approve PR: ${response.status} ${text}`);
    }
  },

  async provisionHooks() {
    // GitHub App webhooks are org-wide; no per-repo provisioning needed.
  },

  async deprovisionHooks() {
    // GitHub App webhooks are org-wide; no per-repo cleanup needed.
  },
};

export function registerGithubSourceControlProvider(): void {
  registerSourceControlProvider(githubSourceControlAdapter);
}
