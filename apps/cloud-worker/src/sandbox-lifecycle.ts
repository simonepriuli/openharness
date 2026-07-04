import { Result } from "better-result";
import { SandboxStopError } from "./errors.js";

export async function stopSandboxIfPresent(): Promise<Result<void, SandboxStopError>> {
  const sandboxName =
    process.env.VERCEL_SANDBOX_NAME?.trim() || process.env.VERCEL_SANDBOX_ID?.trim();
  if (!sandboxName) {
    return Result.ok(undefined);
  }

  const apiUrl = process.env.OPENHARNESS_API_URL?.trim()?.replace(/\/$/, "");
  const secret = process.env.CLOUD_WORKER_SECRET?.trim();
  if (!apiUrl || !secret) {
    console.warn("[cloud-worker] cannot stop sandbox: missing OPENHARNESS_API_URL or CLOUD_WORKER_SECRET");
    return Result.ok(undefined);
  }

  const result = await Result.tryPromise({
    try: async () => {
      const response = await fetch(`${apiUrl}/api/internal/workflow-runs/sandboxes/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sandboxName }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`API stop failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      console.log("[cloud-worker] stopped sandbox via API", { sandboxName });
    },
    catch: (cause) => new SandboxStopError({ sandboxName, cause }),
  });

  return result;
}
