import { createDb } from "@openharness/db";
import { and, eq, sql } from "@openharness/db";
import { sourceControlRepo } from "@openharness/db/schema";
import { env } from "../env.js";
import { listOrgAccessibleRepos } from "../github/sync.js";
import { registerSourceControlProvider } from "../source-control/registry.js";
import type { ProviderConnectionStatus, SourceControlProviderAdapter } from "../source-control/types.js";
import {
  adoCreateInlineComment,
  adoEnrichRunPayload,
  adoFetchGitCredentials,
  adoFetchPrContext,
  adoGetAutomationIdentity,
  adoPostIssueComment,
  adoReplyToThread,
  adoResolveThread,
  adoSubmitReview,
  normalizeAdoWorkflowTriggerInput,
} from "./ado-pr-service.js";
import {
  connectAzureDevOpsOrg,
  deprovisionServiceHooks,
  disconnectAzureDevOpsOrg,
  getAdoClientForOrg,
  getAdoConnectionForOrg,
  provisionServiceHooks,
} from "./service-hooks.js";
import { normalizeAzureDevOpsWebhookEvent } from "./webhook-normalize.js";
import { handleNormalizedWebhookEvent } from "../source-control/webhook-handler.js";
import { AzureDevOpsClient } from "./client.js";

const db = createDb(env.databaseUrl());
const ADO_PROVIDER = "azure_devops" as const;

export const azureDevOpsSourceControlAdapter: SourceControlProviderAdapter = {
  provider: ADO_PROVIDER,

  async getStatus(organizationId: string): Promise<ProviderConnectionStatus> {
    const connection = await getAdoConnectionForOrg(db, organizationId);
    if (!connection) {
      return {
        configured: true,
        connected: false,
        agentReady: false,
        connections: [],
      };
    }

    const repoCount = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(sourceControlRepo)
      .where(eq(sourceControlRepo.connectionId, connection.id));

    const count = repoCount[0]?.count ?? 0;

    return {
      configured: true,
      connected: true,
      agentReady: count > 0,
      connections: [
        {
          connectionId: connection.id,
          displayName: connection.displayName,
          externalOrgId: connection.externalOrgId,
          repoCount: count,
          metadata: connection.metadata as Record<string, unknown>,
        },
      ],
    };
  },

  async listAccessibleRepos(organizationId, options) {
    const result = await listOrgAccessibleRepos(
      db,
      organizationId,
      options?.query,
      options?.page,
      options?.perPage,
      ADO_PROVIDER,
    );
    return {
      ...result,
      repos: result.repos.map((repo) => ({
        provider: ADO_PROVIDER,
        externalRepoId: repo.externalRepoId,
        namespace: repo.namespace,
        name: repo.name,
        fullName: repo.fullName,
        connectionId: repo.connectionId,
      })),
    };
  },

  async listBranches(organizationId, namespace, name) {
    const ctx = await getAdoClientForOrg(db, organizationId);
    if (!ctx) throw new Error("azure_devops_not_connected");
    return ctx.client.listBranches(namespace, name);
  },

  normalizeWebhookEvent(body, headers) {
    return normalizeAzureDevOpsWebhookEvent(body, headers);
  },

  async getAutomationIdentity(organizationId) {
    return adoGetAutomationIdentity(db, organizationId);
  },

  normalizeWorkflowTriggerInput(event) {
    return normalizeAdoWorkflowTriggerInput(event);
  },

  async enrichRunPayload(organizationId, event) {
    return adoEnrichRunPayload(db, organizationId, event);
  },

  async fetchPrContext(organizationId, namespace, repoName, prNumber) {
    return adoFetchPrContext(db, organizationId, namespace, repoName, prNumber);
  },

  async fetchGitCredentials(organizationId, namespace, repoName) {
    return adoFetchGitCredentials(db, organizationId, namespace, repoName);
  },

  async submitReview(organizationId, namespace, repoName, prNumber, input) {
    return adoSubmitReview(db, organizationId, namespace, repoName, prNumber, input);
  },

  async createInlineComment(organizationId, namespace, repoName, prNumber, input) {
    return adoCreateInlineComment(db, organizationId, namespace, repoName, prNumber, input);
  },

  async replyToThread(organizationId, namespace, repoName, prNumber, threadId, body) {
    return adoReplyToThread(db, organizationId, namespace, repoName, prNumber, threadId, body);
  },

  async resolveThread(organizationId, namespace, repoName, prNumber, threadId) {
    return adoResolveThread(db, organizationId, namespace, repoName, prNumber, threadId);
  },

  async postIssueComment(organizationId, namespace, repoName, prNumber, body) {
    return adoPostIssueComment(db, organizationId, namespace, repoName, prNumber, body);
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

  async provisionHooks({ organizationId, projectConnectionId }) {
    await provisionServiceHooks(db, organizationId, projectConnectionId);
  },

  async deprovisionHooks({ organizationId, projectConnectionId }) {
    await deprovisionServiceHooks(db, organizationId, projectConnectionId);
  },
};

export function registerAzureDevOpsSourceControlProvider(): void {
  registerSourceControlProvider(azureDevOpsSourceControlAdapter);
}

export { connectAzureDevOpsOrg, disconnectAzureDevOpsOrg };

export async function handleAzureDevOpsWebhook(
  body: string,
  headers: Record<string, string | undefined>,
): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const normalized = normalizeAzureDevOpsWebhookEvent(parsed, headers);
  if (!normalized) {
    return new Response("Ignored", { status: 200 });
  }

  await handleNormalizedWebhookEvent(db, ADO_PROVIDER, normalized);
  return new Response("OK", { status: 200 });
}

export async function findAdoRepoInOrg(
  organizationId: string,
  namespace: string,
  name: string,
) {
  const connection = await getAdoConnectionForOrg(db, organizationId);
  if (!connection) return null;

  const rows = await db
    .select()
    .from(sourceControlRepo)
    .where(
      and(
        eq(sourceControlRepo.connectionId, connection.id),
        sql`lower(${sourceControlRepo.namespace}) = ${namespace.toLowerCase()}`,
        sql`lower(${sourceControlRepo.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);

  const repo = rows[0];
  if (!repo) return null;

  return {
    externalRepoId: repo.externalRepoId,
    namespace: repo.namespace,
    name: repo.name,
    fullName: repo.fullName,
    connectionId: connection.id,
    externalOrgId: connection.externalOrgId,
  };
}

export async function validateAzureDevOpsPat(orgName: string, pat: string): Promise<boolean> {
  try {
    const client = new AzureDevOpsClient(orgName.trim().toLowerCase(), pat.trim());
    await client.validateConnection();
    return true;
  } catch {
    return false;
  }
}