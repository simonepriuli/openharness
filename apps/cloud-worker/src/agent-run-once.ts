import type { CloudWorkerConfig } from "./config.js";
import {
  executeCloudLinearAgentRun,
  pendingLinearAgentRunFromApi,
} from "./execute-cloud-linear-agent-run.js";
import type { RunOnceArgs } from "./cli.js";
import { startSandboxTimeoutExtender } from "./sandbox-timeout.js";
import { stopSandboxIfPresent } from "./sandbox-lifecycle.js";

export async function agentRunOnceCommand(
  config: CloudWorkerConfig,
  args: RunOnceArgs,
): Promise<number> {
  const extender = startSandboxTimeoutExtender({
    sandboxName: process.env.VERCEL_SANDBOX_NAME,
  });

  try {
    const run = await pendingLinearAgentRunFromApi(config, args.runId, args.organizationId);
    const result = await executeCloudLinearAgentRun(config, run);
    if (result.ok) return 0;
    if (result.reason === "claim_conflict") return 0;
    return 1;
  } finally {
    extender.stop();
    await stopSandboxIfPresent();
  }
}
