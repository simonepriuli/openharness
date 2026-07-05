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
