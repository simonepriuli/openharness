import { Result } from "better-result";
import type { CloudWorkerConfig } from "./config.js";
import {
  executeCloudLinearAgentRun,
  pendingLinearAgentRunFromApi,
  shouldRetainLinearAgentSandbox,
} from "./execute-cloud-linear-agent-run.js";
import type { RunOnceArgs } from "./cli.js";
import { infrastructureResultToExitCode } from "./result-helpers.js";
import { startSandboxTimeoutExtender } from "./sandbox-timeout.js";
import { stopSandboxIfPresent } from "./sandbox-lifecycle.js";

export async function agentRunOnceCommand(
  config: CloudWorkerConfig,
  args: RunOnceArgs,
): Promise<number> {
  const extender = startSandboxTimeoutExtender({
    sandboxName: process.env.VERCEL_SANDBOX_NAME,
  });

  const runResult = await pendingLinearAgentRunFromApi(
    config,
    args.runId,
    args.organizationId,
  );
  let exitCode: number;
  if (Result.isError(runResult)) {
    console.error("[cloud-worker] agent-run-once failed", runResult.error.message);
    exitCode = infrastructureResultToExitCode(runResult);
  } else {
    const result = await executeCloudLinearAgentRun(config, runResult.value);
    exitCode = infrastructureResultToExitCode(result);
  }

  extender.stop();
  if (!shouldRetainLinearAgentSandbox()) {
    const stopResult = await stopSandboxIfPresent();
    if (Result.isError(stopResult)) {
      console.warn("[cloud-worker] sandbox stop failed", stopResult.error.message);
    }
  }

  return exitCode;
}
