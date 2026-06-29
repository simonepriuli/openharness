const DEFAULT_EXTEND_BY_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;
const DEFAULT_THRESHOLD_MS = 5 * 60 * 1000;

export type SandboxTimeoutExtender = {
  stop: () => void;
};

export function startSandboxTimeoutExtender(options?: {
  sandboxId?: string;
  extendByMs?: number;
  pollMs?: number;
  thresholdMs?: number;
}): SandboxTimeoutExtender {
  const sandboxId = options?.sandboxId?.trim() || process.env.VERCEL_SANDBOX_ID?.trim();
  if (!sandboxId) {
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
        const sandbox = await Sandbox.get({ sandboxId });
        const remaining = sandbox.timeout;
        if (typeof remaining !== "number" || remaining > thresholdMs) {
          return;
        }
        await sandbox.extendTimeout(extendByMs);
        console.log("[cloud-worker] extended sandbox timeout", {
          sandboxId,
          extendByMs,
          remainingBeforeMs: remaining,
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
