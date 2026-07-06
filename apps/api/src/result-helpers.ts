import type { Context } from "hono";
import { matchError, Result } from "better-result";
import {
  AzureDevOpsApiError,
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
  TeamsApiError,
  ValidationError,
  WorkflowValidationError,
  type RunEventsError,
} from "./errors.js";

type HttpStatus = 400 | 403 | 404 | 409 | 500 | 503;

type MappedHttpError = {
  status: HttpStatus;
  message: string;
  code?: string;
};

/** Unwrap a Result by throwing its error value (preserves TaggedError instances for adapter boundaries). */
export function unwrapResult<T, E>(result: Result<T, E>): T {
  if (Result.isError(result)) throw result.error;
  return result.value;
}

type JsonBody = Response;

type RespondFromResultOptions<T> = {
  asJson?: boolean;
  success?: (value: T) => JsonBody;
};

export function respondFromResult<T, E>(
  c: Context,
  result: Result<T, E>,
  mapError: (error: E) => MappedHttpError,
  options: { asJson: false },
): T | JsonBody;
export function respondFromResult<T, E>(
  c: Context,
  result: Result<T, E>,
  mapError: (error: E) => MappedHttpError,
  options?: { asJson?: true; success?: (value: T) => JsonBody },
): JsonBody;
export function respondFromResult<T, E>(
  c: Context,
  result: Result<T, E>,
  mapError: (error: E) => MappedHttpError,
  options: RespondFromResultOptions<T> = {},
): T | JsonBody {
  if (Result.isError(result)) {
    const mapped = mapError(result.error);
    const body = mapped.code
      ? { error: mapped.message, code: mapped.code }
      : { error: mapped.message };
    return c.json(body, mapped.status);
  }
  if (options.success) return options.success(result.value);
  if (options.asJson === false) return result.value;
  return c.json(result.value);
}

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
  return respondFromResult(c, result, mapRunEventsError);
}

export function respondFromNotifyResult(c: Context, result: Result<void, NotifyError>) {
  return respondFromResult(c, result, (error) => ({
    status: error.status,
    message: error.message,
  }), { success: () => c.json({ ok: true }) });
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
  return matchError(error, {
    RunNotFoundError: () => "RUN_NOT_FOUND",
    RunNotActiveError: () => "RUN_NOT_ACTIVE",
    BatchTooLargeError: () => "BATCH_TOO_LARGE",
  });
}

export function mapOrgError(error: OrgDbError): {
  status: 400 | 404 | 500;
  message: string;
  code: string;
} {
  return matchError(error, {
    OrgDbError: (e) => {
      if (
        e.code === "ALREADY_IN_ORG" ||
        e.code === "INVALID_CODE" ||
        e.code === "INVALID_NAME"
      ) {
        return { status: 400, message: e.message, code: e.code };
      }
      if (e.code === "ORG_NOT_FOUND") {
        return { status: 404, message: e.message, code: e.code };
      }
      return { status: 500, message: e.message, code: e.code };
    },
  });
}

export function respondFromOrgResult<T>(c: Context, result: Result<T, OrgDbError>) {
  return respondFromResult(c, result, mapOrgError, { asJson: false });
}

export function respondFromOrgResultJson<T>(c: Context, result: Result<T, OrgDbError>) {
  return respondFromResult(c, result, mapOrgError);
}

export function mapOrgSecretsError(error: OrgSecretsError): {
  status: 400;
  message: string;
  code: string;
} {
  return { status: 400, message: error.message, code: error.code };
}

export function respondFromOrgSecretsResult<T>(c: Context, result: Result<T, OrgSecretsError>) {
  return respondFromResult(c, result, mapOrgSecretsError, { asJson: false });
}

export function respondFromOrgSecretsResultJson<T>(
  c: Context,
  result: Result<T, OrgSecretsError>,
) {
  return respondFromResult(c, result, mapOrgSecretsError);
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
  return respondFromResult(c, result, mapRepoEnvironmentError, { asJson: false });
}

export function respondFromRepoEnvironmentResultJson<T>(
  c: Context,
  result: Result<T, RepoEnvironmentError>,
) {
  return respondFromResult(c, result, mapRepoEnvironmentError);
}

function mapValidationError(error: ValidationError): MappedHttpError {
  return { status: 400, message: error.message };
}

export function respondFromValidationResult<T>(c: Context, result: Result<T, ValidationError>) {
  return respondFromResult(c, result, mapValidationError, { asJson: false });
}

export function respondFromValidationResultJson<T>(
  c: Context,
  result: Result<T, ValidationError>,
) {
  return respondFromResult(c, result, mapValidationError);
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
  return respondFromResult(c, result, mapWorkflowValidationError, { asJson: false });
}

export function respondFromWorkflowValidationResultJson<T>(
  c: Context,
  result: Result<T, WorkflowValidationError>,
) {
  return respondFromResult(c, result, mapWorkflowValidationError);
}

export function mapLinearApiError(error: LinearApiError | OAuthError | ValidationError): {
  status: 400;
  message: string;
} {
  return matchError(error, {
    LinearApiError: (e) => ({ status: 400, message: e.message }),
    OAuthError: (e) => ({ status: 400, message: e.message }),
    ValidationError: (e) => ({ status: 400, message: e.message }),
  });
}

export function respondFromLinearResult<T>(
  c: Context,
  result: Result<T, LinearApiError | OAuthError | ValidationError>,
) {
  return respondFromResult(c, result, mapLinearApiError, { asJson: false });
}

export function respondFromLinearResultJson<T>(
  c: Context,
  result: Result<T, LinearApiError | OAuthError | ValidationError>,
) {
  return respondFromResult(c, result, mapLinearApiError);
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
  return respondFromResult(c, result, mapGithubApiError, { asJson: false });
}

export function respondFromGithubResultJson<T>(c: Context, result: Result<T, GithubApiError>) {
  return respondFromResult(c, result, mapGithubApiError);
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
  return respondFromResult(c, result, mapAzureDevOpsApiError, { asJson: false });
}

export function respondFromAzureDevOpsResultJson<T>(
  c: Context,
  result: Result<T, AzureDevOpsApiError>,
) {
  return respondFromResult(c, result, mapAzureDevOpsApiError);
}

export function mapDiscordApiError(error: DiscordApiError | OAuthError): {
  status: 400 | 500;
  message: string;
} {
  return matchError(error, {
    OAuthError: (e) => ({ status: 400, message: e.message }),
    DiscordApiError: (e) => {
      if (e.status && e.status >= 400 && e.status < 500) {
        return { status: 400, message: e.message };
      }
      return { status: 500, message: e.message };
    },
  });
}

export function respondFromDiscordResult<T>(
  c: Context,
  result: Result<T, DiscordApiError | OAuthError>,
) {
  return respondFromResult(c, result, mapDiscordApiError, { asJson: false });
}

export function respondFromDiscordResultJson<T>(
  c: Context,
  result: Result<T, DiscordApiError | OAuthError>,
) {
  return respondFromResult(c, result, mapDiscordApiError);
}

export function mapTeamsApiError(error: TeamsApiError | OAuthError): {
  status: 400 | 500;
  message: string;
} {
  return matchError(error, {
    OAuthError: (e) => ({ status: 400, message: e.message }),
    TeamsApiError: (e) => {
      if (e.status && e.status >= 400 && e.status < 500) {
        return { status: 400, message: e.message };
      }
      return { status: 500, message: e.message };
    },
  });
}

export function respondFromTeamsResult<T>(c: Context, result: Result<T, TeamsApiError | OAuthError>) {
  return respondFromResult(c, result, mapTeamsApiError, { asJson: false });
}

export function respondFromTeamsResultJson<T>(
  c: Context,
  result: Result<T, TeamsApiError | OAuthError>,
) {
  return respondFromResult(c, result, mapTeamsApiError);
}

function mapInfrastructureError(error: InfrastructureError): MappedHttpError {
  return { status: 500, message: error.message };
}

export function respondFromInfrastructureResult<T>(
  c: Context,
  result: Result<T, InfrastructureError>,
) {
  return respondFromResult(c, result, mapInfrastructureError, { asJson: false });
}

export function respondFromInfrastructureResultJson<T>(
  c: Context,
  result: Result<T, InfrastructureError>,
) {
  return respondFromResult(c, result, mapInfrastructureError);
}

