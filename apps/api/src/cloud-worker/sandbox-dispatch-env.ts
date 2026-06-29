export const SANDBOX_BUNDLE_ROOT = "/vercel/sandbox/openharness";
export const SANDBOX_INITIAL_TIMEOUT_MS = 15 * 60 * 1000;

export function isSandboxDispatchEnabled(): boolean {
  return (
    process.env.VERCEL === "1" &&
    Boolean(process.env.CLOUD_WORKER_SNAPSHOT_ID?.trim()) &&
    Boolean(process.env.CLOUD_WORKER_SECRET?.trim())
  );
}
