import type { Context } from "hono";
import { matchError, Result } from "better-result";
import {
  AzureDevOpsApiError,
  BatchTooLargeError,
  ClaimConflictError,
  DiscordApiError,
  GithubApiError,
  InfrastructureError,
  LinearApiError,
  NotifyError,
  OAuthError,
  OrgDbError,
  OrgSecretsError,
  RepoEnvironmentError,
  RunNotActiveError,
  RunNotFoundError,
  TeamsApiError,
  ValidationError,
  WorkflowValidationError,
  type RunEventsError,
} from "./errors.js";

type HttpStatus = 400 | 404 | 409 | 500 | 503;

export function respondWithError(c: Context, message: string, status: HttpStatus) {
  return c.json({ error: message }, status);
}

export function wrapInfrastructureError(operation: string, cause: unknown): InfrastructureError {
  return new InfrastructureError({ operation, cause });
}

export function mapRunEventsError(error: RunEventsError): {
  status: 400 | 404 | 409;
  message: string;
  code: "BATCH_TOO_LARGE" | "RUN_NOT_FOUND" | "RUN_NOT_ACTIVE";
} {
  return matchError(error, {
    RunNotFoundError: (e) => ({
      status: 404,
      message: e.message,
      code: "RUN_NOT_FOUND",
    }),
    RunNotActiveError: (e) => ({
      status: 409,
      message: e.message,
      code: "RUN_NOT_ACTIVE",
    }),
    BatchTooLargeError: (e) => ({
      status: 400,
      message: e.message,
      code: "BATCH_TOO_LARGE",
    }),
  });
}

export function respondFromRunEventsResult(
  c: Context,
  result: Result<{ appended: number; lastSeq: number | null }, RunEventsError>,
) {
  if (Result.isError(result)) {
    const mapped = mapRunEventsError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return c.json(result.value);
}

export function respondFromNotifyResult(c: Context, result: Result<void, NotifyError>) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, result.error.status);
  }
  return c.json({ ok: true });
}

export function wrapClaimResult<T>(
  runId: string,
  run: T | null | undefined,
): Result<T, ClaimConflictError> {
  if (!run) {
    return Result.err(new ClaimConflictError({ runId }));
  }
  return Result.ok(run);
}

export function runEventsErrorCode(
  error: RunEventsError,
): "BATCH_TOO_LARGE" | "RUN_NOT_FOUND" | "RUN_NOT_ACTIVE" {
  if (RunNotFoundError.is(error)) return "RUN_NOT_FOUND";
  if (RunNotActiveError.is(error)) return "RUN_NOT_ACTIVE";
  if (BatchTooLargeError.is(error)) return "BATCH_TOO_LARGE";
  throw error;
}

export function mapOrgError(error: OrgDbError): {
  status: 400 | 404 | 500;
  message: string;
  code: string;
} {
  if (
    error.code === "ALREADY_IN_ORG" ||
    error.code === "INVALID_CODE" ||
    error.code === "INVALID_NAME"
  ) {
    return { status: 400, message: error.message, code: error.code };
  }
  if (error.code === "ORG_NOT_FOUND") {
    return { status: 404, message: error.message, code: error.code };
  }
  return { status: 500, message: error.message, code: error.code };
}

export function respondFromOrgResult<T>(c: Context, result: Result<T, OrgDbError>) {
  if (Result.isError(result)) {
    const mapped = mapOrgError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return result.value;
}

export function respondFromOrgResultJson<T>(c: Context, result: Result<T, OrgDbError>) {
  if (Result.isError(result)) {
    const mapped = mapOrgError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return c.json(result.value);
}

export function mapOrgSecretsError(error: OrgSecretsError): {
  status: 400;
  message: string;
  code: string;
} {
  return { status: 400, message: error.message, code: error.code };
}

export function respondFromOrgSecretsResult<T>(c: Context, result: Result<T, OrgSecretsError>) {
  if (Result.isError(result)) {
    const mapped = mapOrgSecretsError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return result.value;
}

export function respondFromOrgSecretsResultJson<T>(
  c: Context,
  result: Result<T, OrgSecretsError>,
) {
  if (Result.isError(result)) {
    const mapped = mapOrgSecretsError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return c.json(result.value);
}

export function mapRepoEnvironmentError(error: RepoEnvironmentError): {
  status: 400 | 404;
  message: string;
  code: string;
} {
  const status = error.code === "CONNECTION_NOT_FOUND" ? 404 : 400;
  return { status, message: error.message, code: error.code };
}

export function respondFromRepoEnvironmentResult<T>(
  c: Context,
  result: Result<T, RepoEnvironmentError>,
) {
  if (Result.isError(result)) {
    const mapped = mapRepoEnvironmentError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return result.value;
}

export function respondFromRepoEnvironmentResultJson<T>(
  c: Context,
  result: Result<T, RepoEnvironmentError>,
) {
  if (Result.isError(result)) {
    const mapped = mapRepoEnvironmentError(result.error);
    return c.json({ error: mapped.message, code: mapped.code }, mapped.status);
  }
  return c.json(result.value);
}

export function respondFromValidationResult<T>(c: Context, result: Result<T, ValidationError>) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, 400);
  }
  return result.value;
}

export function respondFromValidationResultJson<T>(
  c: Context,
  result: Result<T, ValidationError>,
) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, 400);
  }
  return c.json(result.value);
}

export function mapWorkflowValidationError(error: WorkflowValidationError): {
  status: 400 | 404 | 500;
  message: string;
} {
  return { status: error.status ?? 400, message: error.message };
}

export function respondFromWorkflowValidationResult<T>(
  c: Context,
  result: Result<T, WorkflowValidationError>,
) {
  if (Result.isError(result)) {
    const mapped = mapWorkflowValidationError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromWorkflowValidationResultJson<T>(
  c: Context,
  result: Result<T, WorkflowValidationError>,
) {
  if (Result.isError(result)) {
    const mapped = mapWorkflowValidationError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

export function mapLinearApiError(error: LinearApiError | OAuthError | ValidationError): {
  status: 400;
  message: string;
} {
  return { status: 400, message: error.message };
}

export function respondFromLinearResult<T>(
  c: Context,
  result: Result<T, LinearApiError | OAuthError | ValidationError>,
) {
  if (Result.isError(result)) {
    const mapped = mapLinearApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromLinearResultJson<T>(
  c: Context,
  result: Result<T, LinearApiError | OAuthError | ValidationError>,
) {
  if (Result.isError(result)) {
    const mapped = mapLinearApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

function mapProviderApiError(error: { status?: number; message: string }): {
  status: 400 | 403 | 404 | 500;
  message: string;
} {
  if (error.status === 404) return { status: 404, message: error.message };
  if (error.status === 403) return { status: 403, message: error.message };
  if (error.status && error.status >= 400 && error.status < 500) {
    return { status: 400, message: error.message };
  }
  return { status: 500, message: error.message };
}

export function mapGithubApiError(error: GithubApiError): {
  status: 400 | 403 | 404 | 500;
  message: string;
} {
  return mapProviderApiError(error);
}

export function respondFromGithubResult<T>(c: Context, result: Result<T, GithubApiError>) {
  if (Result.isError(result)) {
    const mapped = mapGithubApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromGithubResultJson<T>(c: Context, result: Result<T, GithubApiError>) {
  if (Result.isError(result)) {
    const mapped = mapGithubApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

export function mapAzureDevOpsApiError(error: AzureDevOpsApiError): {
  status: 400 | 403 | 404 | 500;
  message: string;
} {
  return mapProviderApiError(error);
}

export function respondFromAzureDevOpsResult<T>(
  c: Context,
  result: Result<T, AzureDevOpsApiError>,
) {
  if (Result.isError(result)) {
    const mapped = mapAzureDevOpsApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromAzureDevOpsResultJson<T>(
  c: Context,
  result: Result<T, AzureDevOpsApiError>,
) {
  if (Result.isError(result)) {
    const mapped = mapAzureDevOpsApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

export function mapDiscordApiError(error: DiscordApiError | OAuthError): {
  status: 400 | 500;
  message: string;
} {
  if (OAuthError.is(error)) {
    return { status: 400, message: error.message };
  }
  if (error.status && error.status >= 400 && error.status < 500) {
    return { status: 400, message: error.message };
  }
  return { status: 500, message: error.message };
}

export function respondFromDiscordResult<T>(
  c: Context,
  result: Result<T, DiscordApiError | OAuthError>,
) {
  if (Result.isError(result)) {
    const mapped = mapDiscordApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromDiscordResultJson<T>(
  c: Context,
  result: Result<T, DiscordApiError | OAuthError>,
) {
  if (Result.isError(result)) {
    const mapped = mapDiscordApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

export function mapTeamsApiError(error: TeamsApiError | OAuthError): {
  status: 400 | 500;
  message: string;
} {
  if (OAuthError.is(error)) {
    return { status: 400, message: error.message };
  }
  if (error.status && error.status >= 400 && error.status < 500) {
    return { status: 400, message: error.message };
  }
  return { status: 500, message: error.message };
}

export function respondFromTeamsResult<T>(c: Context, result: Result<T, TeamsApiError | OAuthError>) {
  if (Result.isError(result)) {
    const mapped = mapTeamsApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return result.value;
}

export function respondFromTeamsResultJson<T>(
  c: Context,
  result: Result<T, TeamsApiError | OAuthError>,
) {
  if (Result.isError(result)) {
    const mapped = mapTeamsApiError(result.error);
    return c.json({ error: mapped.message }, mapped.status);
  }
  return c.json(result.value);
}

export function respondFromInfrastructureResult<T>(
  c: Context,
  result: Result<T, InfrastructureError>,
) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, 500);
  }
  return result.value;
}

export function respondFromInfrastructureResultJson<T>(
  c: Context,
  result: Result<T, InfrastructureError>,
) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, 500);
  }
  return c.json(result.value);
}

export function invokeProviderAdapter<T>(
  provider: import("@openharness/db/schema").SourceControlProvider,
  fn: () => Promise<T>,
): Promise<Result<T, GithubApiError | AzureDevOpsApiError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) => {
      if (GithubApiError.is(cause)) return cause;
      if (AzureDevOpsApiError.is(cause)) return cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      return provider === "github"
        ? new GithubApiError({ message, cause })
        : new AzureDevOpsApiError({ message, cause });
    },
  });
}
