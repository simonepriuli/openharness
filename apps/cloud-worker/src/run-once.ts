import type { CloudWorkerConfig } from "./config.js";
import { executeCloudRun, pendingRunFromApi } from "./execute-cloud-run.js";
import type { RunOnceArgs } from "./cli.js";
import { startSandboxTimeoutExtender } from "./sandbox-timeout.js";

export async function runOnceCommand(
  config: CloudWorkerConfig,
  args: RunOnceArgs,
): Promise<number> {
  const extender = startSandboxTimeoutExtender({
    sandboxId: process.env.VERCEL_SANDBOX_ID,
  });

  try {
    const run = await pendingRunFromApi(config, args.runId, args.organizationId);
    const result = await executeCloudRun(config, run);
    if (result.ok) return 0;
    if (result.reason === "claim_conflict") return 0;
    return 1;
  } finally {
    extender.stop();
  }
}
