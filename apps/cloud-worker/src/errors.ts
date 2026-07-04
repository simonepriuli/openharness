import { TaggedError } from "better-result";

export class ConfigError extends TaggedError("ConfigError")<{
  field: string;
  message: string;
}>() {
  constructor(args: { field: string }) {
    super({ ...args, message: `${args.field} is required` });
  }
}

export class CliParseError extends TaggedError("CliParseError")<{
  message: string;
}>() {}

export class ApiUnreachableError extends TaggedError("ApiUnreachableError")<{
  apiUrl: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { apiUrl: string; cause: unknown }) {
    const detail =
      args.cause instanceof Error
        ? args.cause.message
        : args.cause
          ? String(args.cause)
          : "unknown error";
    super({
      ...args,
      message: `API not reachable at ${args.apiUrl} (${detail}). Is pnpm dev:api running?`,
    });
  }
}

export class ClaimConflictError extends TaggedError("ClaimConflictError")<{
  runId: string;
  message: string;
}>() {
  constructor(args: { runId: string }) {
    super({ ...args, message: `Run ${args.runId} is not available for claim` });
  }
}

export class MissingConnectionError extends TaggedError("MissingConnectionError")<{
  runId: string;
  message: string;
}>() {
  constructor(args: { runId: string; context?: string }) {
    const suffix = args.context ? ` for ${args.context}` : "";
    super({
      runId: args.runId,
      message: `Missing project source control connection${suffix}`,
    });
  }
}

export class IterationCapError extends TaggedError("IterationCapError")<{
  runId: string;
  cap: number;
  message: string;
}>() {
  constructor(args: { runId: string; cap: number }) {
    super({ ...args, message: `Iteration cap (${args.cap}) reached` });
  }
}

export class CloudRunFailedError extends TaggedError("CloudRunFailedError")<{
  runId: string;
  message: string;
  cause?: unknown;
}>() {
  constructor(args: { runId: string; cause: unknown }) {
    const message = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ runId: args.runId, message, cause: args.cause });
  }
}

export class CloudWorkerInfrastructureError extends TaggedError("CloudWorkerInfrastructureError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    const detail = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ ...args, message: `${args.operation} failed: ${detail}` });
  }
}

export class SandboxStopError extends TaggedError("SandboxStopError")<{
  sandboxName: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { sandboxName: string; cause: unknown }) {
    const detail = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ ...args, message: `Failed to stop sandbox ${args.sandboxName}: ${detail}` });
  }
}

export class ExtensionEnvError extends TaggedError("ExtensionEnvError")<{
  extension: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { extension: string; cause: unknown }) {
    const detail = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({ ...args, message: `Failed to build ${args.extension} env: ${detail}` });
  }
}

export type CloudRunError =
  | ClaimConflictError
  | MissingConnectionError
  | IterationCapError
  | CloudRunFailedError
  | CloudWorkerInfrastructureError;

export type CloudWorkerStartupError = ConfigError | CliParseError | ApiUnreachableError;
