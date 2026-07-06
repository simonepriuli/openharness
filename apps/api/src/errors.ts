import { TaggedError } from "better-result";

export class ClaimConflictError extends TaggedError("ClaimConflictError")<{
  runId: string;
  message: string;
}>() {
  constructor(args: { runId: string; message?: string }) {
    super({
      runId: args.runId,
      message: args.message ?? "Run not available for claim",
    });
  }
}

export class RunNotFoundError extends TaggedError("RunNotFoundError")<{
  message: string;
}>() {}

export class RunNotActiveError extends TaggedError("RunNotActiveError")<{
  message: string;
}>() {}

export class BatchTooLargeError extends TaggedError("BatchTooLargeError")<{
  message: string;
}>() {}

export type RunEventsError = RunNotFoundError | RunNotActiveError | BatchTooLargeError;

export class DispatchError extends TaggedError("DispatchError")<{
  message: string;
}>() {}

export class SandboxError extends TaggedError("SandboxError")<{
  message: string;
  cause?: unknown;
}>() {
  constructor(args: { message: string; cause?: unknown }) {
    super(args);
  }
}

export class NotifyError extends TaggedError("NotifyError")<{
  status: 400 | 404 | 409 | 503;
  message: string;
}>() {}

export class ValidationError extends TaggedError("ValidationError")<{
  message: string;
}>() {}

export class OrgDbError extends TaggedError("OrgDbError")<{
  code: string;
  message: string;
}>() {
  constructor(args: { code: string; message: string }) {
    super(args);
  }
}

export type OrgError = OrgDbError;

export class OrgSecretsError extends TaggedError("OrgSecretsError")<{
  code: "INVALID_SLOT" | "INVALID_VALUE";
  message: string;
}>() {
  constructor(args: { code: "INVALID_SLOT" | "INVALID_VALUE"; message: string }) {
    super(args);
  }
}

export class RepoEnvironmentError extends TaggedError("RepoEnvironmentError")<{
  code: "INVALID_KEY" | "INVALID_VALUE" | "CONNECTION_NOT_FOUND" | "VARIABLE_NOT_FOUND";
  message: string;
}>() {
  constructor(args: {
    code: "INVALID_KEY" | "INVALID_VALUE" | "CONNECTION_NOT_FOUND" | "VARIABLE_NOT_FOUND";
    message: string;
  }) {
    super(args);
  }
}

export class LinearApiError extends TaggedError("LinearApiError")<{
  message: string;
  cause?: unknown;
}>() {
  constructor(args: { message: string; cause?: unknown }) {
    super(args);
  }
}

export class GithubApiError extends TaggedError("GithubApiError")<{
  message: string;
  status?: number;
  cause?: unknown;
}>() {
  constructor(args: { message: string; status?: number; cause?: unknown }) {
    super(args);
  }
}

export class AzureDevOpsApiError extends TaggedError("AzureDevOpsApiError")<{
  message: string;
  status?: number;
  cause?: unknown;
}>() {
  constructor(args: { message: string; status?: number; cause?: unknown }) {
    super(args);
  }
}

export class OAuthError extends TaggedError("OAuthError")<{
  message: string;
  cause?: unknown;
}>() {
  constructor(args: { message: string; cause?: unknown }) {
    super(args);
  }
}

export class DiscordApiError extends TaggedError("DiscordApiError")<{
  message: string;
  status?: number;
  cause?: unknown;
}>() {
  constructor(args: { message: string; status?: number; cause?: unknown }) {
    super(args);
  }
}

export class TeamsApiError extends TaggedError("TeamsApiError")<{
  message: string;
  status?: number;
  cause?: unknown;
}>() {
  constructor(args: { message: string; status?: number; cause?: unknown }) {
    super(args);
  }
}

export class WorkflowValidationError extends TaggedError("WorkflowValidationError")<{
  message: string;
  status?: 400 | 404 | 500;
}>() {
  constructor(args: { message: string; status?: 400 | 404 | 500 }) {
    super(args);
  }
}

export class InfrastructureError extends TaggedError("InfrastructureError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    const detail = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ ...args, message: `${args.operation} failed: ${detail}` });
  }
}

export class NotFoundError extends TaggedError("NotFoundError")<{
  message: string;
}>() {}

export class WebhookError extends TaggedError("WebhookError")<{
  status: 400 | 401;
  message: string;
}>() {}

export class IssueWorkspaceClaimError extends TaggedError("IssueWorkspaceClaimError")<{
  reason: "active_run" | "busy" | "incompatible" | "expired";
  message: string;
}>() {
  constructor(args: {
    reason: "active_run" | "busy" | "incompatible" | "expired";
    message?: string;
  }) {
    super({
      reason: args.reason,
      message:
        args.message ??
        ({
          active_run: "Another run is active for this issue",
          busy: "Issue workspace is busy",
          incompatible: "Issue workspace is incompatible",
          expired: "Issue workspace has expired",
        }[args.reason] as string),
    });
  }
}

export type LinearError = LinearApiError | OAuthError | InfrastructureError;
export type GithubError = GithubApiError | InfrastructureError;
export type AzureDevOpsError = AzureDevOpsApiError | InfrastructureError;
