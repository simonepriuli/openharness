import { Result } from "better-result";
import { ApiUnreachableError } from "./errors.js";
import type { CloudWorkerConfig } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeApi(
  probeUrl: string,
  secret: string,
): Promise<Result<void, unknown>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetch(probeUrl, {
        headers: { authorization: `Bearer ${secret}` },
      });
      if (response.status === 200 || response.status === 401) {
        if (response.status === 401) {
          console.warn(
            "[cloud-worker] API reachable but CLOUD_WORKER_SECRET was rejected (401). Check apps/api/.env.",
          );
        }
        return undefined;
      }
      throw new Error(`Unexpected status ${response.status}`);
    },
    catch: (cause) => cause,
  });
}

export async function waitForApiReachable(
  config: CloudWorkerConfig,
  options: { maxAttempts?: number; delayMs?: number } = {},
): Promise<Result<void, ApiUnreachableError>> {
  const maxAttempts = options.maxAttempts ?? 30;
  const delayMs = options.delayMs ?? 1_000;
  const probeUrl = `${config.apiUrl}/api/internal/workflow-runs/pending`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const probeResult = await probeApi(probeUrl, config.secret);
    if (Result.isOk(probeResult)) {
      return Result.ok(undefined);
    }
    lastError = probeResult.error;

    if (attempt < maxAttempts) {
      console.warn(
        `[cloud-worker] waiting for API at ${config.apiUrl} (attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(delayMs);
    }
  }

  return Result.err(new ApiUnreachableError({ apiUrl: config.apiUrl, cause: lastError }));
}
