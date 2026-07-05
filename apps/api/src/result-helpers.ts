import type { Context } from "hono";
import { matchError, Result } from "better-result";
import {
  BatchTooLargeError,
  ClaimConflictError,
  DispatchError,
  NotifyError,
  RunNotActiveError,
  RunNotFoundError,
  SandboxError,
  SourceControlError,
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

export async function tryPromiseAllowFailure<T>(
  fn: () => Promise<T>,
): Promise<Result<T, unknown>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) => cause,
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

export function respondWithError(c: Context, message: string, status: HttpStatus) {
  return c.json({ error: message }, status);
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
