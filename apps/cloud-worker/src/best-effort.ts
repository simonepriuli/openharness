import { Result } from "better-result";
import { CloudWorkerInfrastructureError } from "./errors.js";

export async function bestEffortAsync(
  operation: string,
  fn: () => Promise<void>,
): Promise<void> {
  const result = await Result.tryPromise({
    try: fn,
    catch: (cause) => new CloudWorkerInfrastructureError({ operation, cause }),
  });
  if (Result.isError(result)) {
    console.warn(`[cloud-worker] ${operation} failed`, result.error.message);
  }
}

export function bestEffortSync(operation: string, fn: () => void): void {
  const result = Result.try({
    try: fn,
    catch: (cause) => new CloudWorkerInfrastructureError({ operation, cause }),
  });
  if (Result.isError(result)) {
    console.warn(`[cloud-worker] ${operation} failed`, result.error.message);
  }
}
