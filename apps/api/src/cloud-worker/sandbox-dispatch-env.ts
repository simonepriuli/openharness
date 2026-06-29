import { EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT } from "./bundle-fingerprint.generated.js";

export const SANDBOX_BUNDLE_ROOT = "/vercel/sandbox/openharness";
export const SANDBOX_BUNDLE_FINGERPRINT_PATH = `${SANDBOX_BUNDLE_ROOT}/.bundle-fingerprint`;
export const SANDBOX_REPOS_ROOT = "/tmp/openharness/repos";
export const SANDBOX_INITIAL_TIMEOUT_MS = 15 * 60 * 1000;

export function cloudWorkerBundleFingerprint(): string | null {
  const envFingerprint = process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT?.trim();
  if (!EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT || !envFingerprint) {
    return null;
  }
  if (EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT !== envFingerprint) {
    return null;
  }
  return envFingerprint;
}

export function isCloudWorkerBundleInSync(): boolean {
  const envFingerprint = process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT?.trim();
  if (!EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT || !envFingerprint) {
    return false;
  }
  return EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT === envFingerprint;
}

export function isSandboxDispatchEnabled(): boolean {
  return (
    process.env.VERCEL === "1" &&
    Boolean(process.env.CLOUD_WORKER_SNAPSHOT_ID?.trim()) &&
    Boolean(process.env.CLOUD_WORKER_SECRET?.trim()) &&
    isCloudWorkerBundleInSync()
  );
}

export function sandboxDispatchDisabledReason(): string | null {
  if (process.env.VERCEL !== "1") {
    return null;
  }
  if (!process.env.CLOUD_WORKER_SNAPSHOT_ID?.trim()) {
    return "CLOUD_WORKER_SNAPSHOT_ID is not configured";
  }
  if (!process.env.CLOUD_WORKER_SECRET?.trim()) {
    return "CLOUD_WORKER_SECRET is not configured";
  }
  if (!isCloudWorkerBundleInSync()) {
    const envFingerprint = process.env.CLOUD_WORKER_BUNDLE_FINGERPRINT?.trim() ?? "(unset)";
    const embedded = EMBEDDED_CLOUD_WORKER_BUNDLE_FINGERPRINT ?? "(unset)";
    return `cloud worker bundle fingerprint mismatch (embedded=${embedded}, env=${envFingerprint})`;
  }
  return null;
}
