import type { SourceControlProvider } from "@openharness/db/schema";
import type { NormalizedWorkflowEvent as WorkflowTriggerNormalizedEvent } from "../github/workflow-trigger-match.js";
import type { WorkflowTriggerEvent } from "../github/workflow-types.js";
import type {
  AutomationIdentity,
  GitCredentials,
  InlineCommentInput,
  PrContext,
  SubmitReviewInput,
} from "./pr-context.js";

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
  event: WorkflowTriggerEvent | "teams_mention" | "discord_mention";
  deliveryId: string;
  namespace: string;
  repoName: string;
  prNumber: number;
  payload: Record<string, unknown>;
  connectionExternalId?: string;
  organizationId?: string;
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

  getAutomationIdentity(organizationId: string): Promise<AutomationIdentity | null>;

  normalizeWorkflowTriggerInput(
    event: NormalizedWebhookEvent,
  ): WorkflowTriggerNormalizedEvent | null;

  enrichRunPayload(
    organizationId: string,
    event: NormalizedWebhookEvent,
  ): Promise<Record<string, unknown>>;

  fetchPrContext(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
  ): Promise<PrContext>;

  fetchGitCredentials(
    organizationId: string,
    namespace: string,
    repoName: string,
  ): Promise<GitCredentials>;

  submitReview(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    input: SubmitReviewInput,
  ): Promise<void>;

  createInlineComment(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    input: InlineCommentInput & { commitId?: string },
  ): Promise<void>;

  replyToThread(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    threadId: string,
    body: string,
  ): Promise<void>;

  resolveThread(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    threadId: string,
  ): Promise<void>;

  postIssueComment(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    body: string,
  ): Promise<void>;

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
