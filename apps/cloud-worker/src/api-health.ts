import type { CloudWorkerConfig } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForApiReachable(
  config: CloudWorkerConfig,
  options: { maxAttempts?: number; delayMs?: number } = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 30;
  const delayMs = options.delayMs ?? 1_000;
  const probeUrl = `${config.apiUrl}/api/internal/workflow-runs/pending`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(probeUrl, {
        headers: { authorization: `Bearer ${config.secret}` },
      });
      if (response.status === 200 || response.status === 401) {
        if (response.status === 401) {
          console.warn(
            "[cloud-worker] API reachable but CLOUD_WORKER_SECRET was rejected (401). Check apps/api/.env.",
          );
        }
        return;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      console.warn(
        `[cloud-worker] waiting for API at ${config.apiUrl} (attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(delayMs);
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : lastError
        ? String(lastError)
        : "unknown error";
  throw new Error(
    `API not reachable at ${config.apiUrl} (${message}). Is pnpm dev:api running?`,
  );
}
