import type { Result } from "better-result";
import type { SourceControlProvider } from "@openharness/db/schema";
import type { AzureDevOpsApiError, GithubApiError } from "../errors.js";
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

export type SourceControlApiError = GithubApiError | AzureDevOpsApiError;

export type CreatedPullRequest = {
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
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
  ): Promise<Result<{ defaultBranch: string; branches: string[] }, SourceControlApiError>>;

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
  ): Promise<Result<PrContext, SourceControlApiError>>;

  fetchGitCredentials(
    organizationId: string,
    namespace: string,
    repoName: string,
  ): Promise<Result<GitCredentials, SourceControlApiError>>;

  submitReview(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    input: SubmitReviewInput,
  ): Promise<Result<void, SourceControlApiError>>;

  createInlineComment(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    input: InlineCommentInput & { commitId?: string },
  ): Promise<Result<void, SourceControlApiError>>;

  replyToThread(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    threadId: string,
    body: string,
  ): Promise<Result<void, SourceControlApiError>>;

  resolveThread(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    threadId: string,
  ): Promise<Result<void, SourceControlApiError>>;

  postIssueComment(
    organizationId: string,
    namespace: string,
    repoName: string,
    prNumber: number,
    body: string,
  ): Promise<Result<void, SourceControlApiError>>;

  createPullRequest(
    organizationId: string,
    namespace: string,
    repoName: string,
    input: { title: string; body: string; head: string; base?: string },
  ): Promise<Result<CreatedPullRequest, SourceControlApiError>>;

  commentOnPr(options: {
    organizationId: string;
    namespace: string;
    repoName: string;
    prNumber: number;
    body: string;
  }): Promise<Result<void, SourceControlApiError>>;

  approvePr(options: {
    organizationId: string;
    namespace: string;
    repoName: string;
    prNumber: number;
  }): Promise<Result<void, SourceControlApiError>>;

  provisionHooks(options: {
    organizationId: string;
    projectConnectionId: string;
    namespace: string;
    name: string;
  }): Promise<Result<void, SourceControlApiError>>;

  deprovisionHooks(options: {
    organizationId: string;
    projectConnectionId: string;
    namespace: string;
    name: string;
  }): Promise<Result<void, SourceControlApiError>>;
}
