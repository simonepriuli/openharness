import type { Context } from "hono";
import { matchError, Result } from "better-result";
import { OrgDbError } from "./org/org-db.js";
import { OrgSecretsError } from "./org/org-secrets-db.js";
import { RepoEnvironmentError } from "./repo-environment/repo-environment-db.js";
import {
  BatchTooLargeError,
  ClaimConflictError,
  DispatchError,
  HttpError,
  NotifyError,
  RunNotActiveError,
  RunNotFoundError,
  SandboxError,
  SourceControlError,
  ValidationError,
  type RunEventsError,
} from "./errors.js";

type HttpStatus = 400 | 404 | 409 | 500 | 503;

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function toSandboxError(cause: unknown): SandboxError {
  return new SandboxError({ message: errorMessage(cause), cause });
}

export function toDispatchError(cause: unknown): DispatchError {
  return new DispatchError({ message: errorMessage(cause) });
}

export function tryAllowFailure(fn: () => unknown): Result<unknown, unknown> {
  return Result.try({
    try: fn,
    catch: (cause) => cause,
  });
}

export async function tryPromiseAllowFailure<T>(
  fn: () => Promise<T>,
): Promise<Result<T, unknown>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) => cause,
  });
}

export function parseJson(raw: string): Result<unknown, ValidationError> {
  return Result.try({
    try: () => JSON.parse(raw) as unknown,
    catch: () => new ValidationError({ message: "Invalid JSON" }),
  });
}

export async function tryHttpPromise<T>(
  tryFn: () => Promise<T>,
  input: { message: string; status: number; code?: string },
): Promise<Result<T, HttpError>> {
  return Result.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new HttpError({
        status: input.status,
        message: errorMessage(cause) || input.message,
        code: input.code,
      }),
  });
}

export async function trySourceControlPromise<T>(
  tryFn: () => Promise<T>,
  input: { message: string; status: 400 | 403 | 404 },
): Promise<Result<T, SourceControlError>> {
  return Result.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new SourceControlError({
        status: input.status,
        message: errorMessage(cause) || input.message,
      }),
  });
}

export function mapOrgDbError(cause: unknown): HttpError | null {
  if (!(cause instanceof OrgDbError)) return null;
  const status =
    cause.code === "ALREADY_IN_ORG" || cause.code === "INVALID_CODE" || cause.code === "INVALID_NAME"
      ? 400
      : 404;
  return new HttpError({ status, message: cause.message, code: cause.code });
}

export function mapOrgSecretsError(cause: unknown): HttpError | null {
  if (!(cause instanceof OrgSecretsError)) return null;
  return new HttpError({ status: 400, message: cause.message, code: cause.code });
}

export function mapRepoEnvironmentError(cause: unknown): HttpError | null {
  if (!(cause instanceof RepoEnvironmentError)) return null;
  const status =
    cause.code === "CONNECTION_NOT_FOUND" || cause.code === "VARIABLE_NOT_FOUND" ? 404 : 400;
  return new HttpError({ status, message: cause.message, code: cause.code });
}

export async function tryOrgDb<T>(fn: () => Promise<T>): Promise<Result<T, HttpError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) =>
      mapOrgDbError(cause) ?? new HttpError({ status: 500, message: errorMessage(cause) }),
  });
}

export async function tryOrgSecrets<T>(fn: () => Promise<T>): Promise<Result<T, HttpError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) =>
      mapOrgSecretsError(cause) ?? new HttpError({ status: 500, message: errorMessage(cause) }),
  });
}

export async function tryRepoEnvironment<T>(fn: () => Promise<T>): Promise<Result<T, HttpError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) =>
      mapRepoEnvironmentError(cause) ??
      new HttpError({ status: 500, message: errorMessage(cause) }),
  });
}

export async function bestEffortAsync(
  operation: string,
  fn: () => Promise<void>,
): Promise<void> {
  const result = await Result.tryPromise({
    try: fn,
    catch: (cause) => toSandboxError(cause),
  });
  if (Result.isError(result)) {
    console.warn(`[api] ${operation} failed`, result.error.message);
  }
}

export async function runBackgroundTick(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  const result = await Result.tryPromise({
    try: fn,
    catch: (cause) => cause,
  });
  if (Result.isError(result)) {
    console.error(label, result.error);
  }
}

export function respondWithError(c: Context, message: string, status: HttpStatus) {
  return c.json({ error: message }, status);
}

export function jsonFromHttpResult<T>(c: Context, result: Result<T, HttpError>) {
  if (Result.isError(result)) {
    const body: { error: string; code?: string } = { error: result.error.message };
    if (result.error.code) body.code = result.error.code;
    return c.json(body, result.error.status as HttpStatus);
  }
  return c.json(result.value);
}

export function jsonFromHttpResultOk<T>(
  c: Context,
  result: Result<T, HttpError>,
  ok: (value: T) => unknown,
) {
  if (Result.isError(result)) {
    const body: { error: string; code?: string } = { error: result.error.message };
    if (result.error.code) body.code = result.error.code;
    return c.json(body, result.error.status as HttpStatus);
  }
  return c.json(ok(result.value));
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

export function respondFromSandboxResult(c: Context, result: Result<void, SandboxError>) {
  if (Result.isError(result)) {
    return respondWithError(c, result.error.message, 500);
  }
  return c.json({ ok: true });
}

export function respondFromSourceControlResult<T>(
  c: Context,
  result: Result<T, SourceControlError>,
) {
  if (Result.isError(result)) {
    return c.json({ error: result.error.message }, result.error.status);
  }
  return c.json(result.value);
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
