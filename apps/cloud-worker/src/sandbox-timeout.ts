const DEFAULT_EXTEND_BY_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;
const DEFAULT_THRESHOLD_MS = 5 * 60 * 1000;

export type SandboxTimeoutExtender = {
  stop: () => void;
};

export function remainingMsUntilExpiry(
  expiresAt: Date | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    return undefined;
  }
  return expiresAt.getTime() - nowMs;
}

export function startSandboxTimeoutExtender(options?: {
  sandboxName?: string;
  /** @deprecated Use sandboxName */
  sandboxId?: string;
  extendByMs?: number;
  pollMs?: number;
  thresholdMs?: number;
}): SandboxTimeoutExtender {
  const sandboxName =
    options?.sandboxName?.trim() ||
    options?.sandboxId?.trim() ||
    process.env.VERCEL_SANDBOX_NAME?.trim() ||
    process.env.VERCEL_SANDBOX_ID?.trim();
  if (!sandboxName) {
    return { stop: () => {} };
  }

  const extendByMs = options?.extendByMs ?? DEFAULT_EXTEND_BY_MS;
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
  const thresholdMs = options?.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  let stopped = false;

  const timer = setInterval(() => {
    void (async () => {
      if (stopped) return;
      try {
        const { Sandbox } = await import("@vercel/sandbox");
        const sandbox = await Sandbox.get({ name: sandboxName });
        const remainingMs = remainingMsUntilExpiry(sandbox.expiresAt);
        if (remainingMs === undefined) {
          console.warn("[cloud-worker] sandbox timeout extension skipped: missing expiresAt", {
            sandboxName,
          });
          return;
        }
        if (remainingMs <= 0 || remainingMs > thresholdMs) {
          return;
        }
        await sandbox.extendTimeout(extendByMs);
        console.log("[cloud-worker] extended sandbox timeout", {
          sandboxName,
          extendByMs,
          remainingBeforeMs: remainingMs,
          expiresAt: sandbox.expiresAt?.toISOString(),
        });
      } catch (err) {
        console.warn(
          "[cloud-worker] sandbox timeout extension failed",
          err instanceof Error ? err.message : err,
        );
      }
    })();
  }, pollMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
