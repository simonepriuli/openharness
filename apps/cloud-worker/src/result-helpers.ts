import { matchError, Result } from "better-result";
import {
  ClaimConflictError,
  CloudWorkerInfrastructureError,
  type CloudRunError,
  type CloudWorkerStartupError,
} from "./errors.js";

export function parseClaimConflict(cause: unknown, runId: string): ClaimConflictError | null {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes("not available") || message.includes("(409)")) {
    return new ClaimConflictError({ runId });
  }
  return null;
}

export function cloudRunResultToExitCode(result: Result<void, CloudRunError>): number {
  if (Result.isOk(result)) return 0;
  if (ClaimConflictError.is(result.error)) return 0;
  return 1;
}

export function infrastructureResultToExitCode<T>(
  result: Result<T, CloudRunError | CloudWorkerInfrastructureError>,
): number {
  if (Result.isOk(result)) return 0;
  if (ClaimConflictError.is(result.error)) return 0;
  return 1;
}

export function logFatalAndExit(error: CloudWorkerStartupError): never {
  const message = matchError(error, {
    ConfigError: (e) => e.message,
    CliParseError: (e) => e.message,
    ApiUnreachableError: (e) => e.message,
  });
  console.error(`[cloud-worker] ${message}`);
  process.exit(1);
}

export function wrapInfrastructureError(
  operation: string,
  cause: unknown,
): CloudWorkerInfrastructureError {
  return new CloudWorkerInfrastructureError({ operation, cause });
}
