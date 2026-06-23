import type { SourceControlProvider } from "@openharness/db/schema";
import type { WorkflowTriggerEvent } from "../github/workflow-types.js";

export type RepoRef = {
  provider: SourceControlProvider;
  namespace: string;
  name: string;
  fullName: string;
  externalRepoId: string;
  connectionId: string;
  remoteUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderConnectionStatus = {
  configured: boolean;
  connected: boolean;
  agentReady: boolean;
  connections: Array<{
    connectionId: string;
    displayName: string;
    externalOrgId: string;
    repoCount: number;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
};

export type RepoSummary = {
  provider: SourceControlProvider;
  externalRepoId: string;
  namespace: string;
  name: string;
  fullName: string;
  connectionId: string;
  installationId?: string;
};

export type NormalizedWebhookEvent = {
  event: WorkflowTriggerEvent | "teams_mention";
  deliveryId: string;
  namespace: string;
  repoName: string;
  prNumber: number;
  payload: Record<string, unknown>;
  connectionExternalId: string;
};

export interface SourceControlProviderAdapter {
  readonly provider: SourceControlProvider;

  getStatus(organizationId: string): Promise<ProviderConnectionStatus>;

  listAccessibleRepos(
    organizationId: string,
    options?: { query?: string; page?: number; perPage?: number },
  ): Promise<{ repos: RepoSummary[]; total: number; page: number; perPage: number }>;

  listBranches(
    organizationId: string,
    namespace: string,
    name: string,
  ): Promise<{ defaultBranch: string; branches: string[] }>;

  normalizeWebhookEvent(
    body: unknown,
    headers: Record<string, string | undefined>,
  ): NormalizedWebhookEvent | null;

  commentOnPr(options: {
    organizationId: string;
    namespace: string;
    repoName: string;
    prNumber: number;
    body: string;
  }): Promise<void>;

  approvePr(options: {
    organizationId: string;
    namespace: string;
    repoName: string;
    prNumber: number;
  }): Promise<void>;

  provisionHooks(options: {
    organizationId: string;
    projectConnectionId: string;
    namespace: string;
    name: string;
  }): Promise<void>;

  deprovisionHooks(options: {
    organizationId: string;
    projectConnectionId: string;
    namespace: string;
    name: string;
  }): Promise<void>;
}
