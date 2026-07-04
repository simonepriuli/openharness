import { Result } from "better-result";
import type { CloudWorkerConfig } from "./config.js";
import { executeCloudRun, pendingRunFromApi } from "./execute-cloud-run.js";
import type { RunOnceArgs } from "./cli.js";
import { infrastructureResultToExitCode } from "./result-helpers.js";
import { startSandboxTimeoutExtender } from "./sandbox-timeout.js";
import { stopSandboxIfPresent } from "./sandbox-lifecycle.js";

export async function runOnceCommand(
  config: CloudWorkerConfig,
  args: RunOnceArgs,
): Promise<number> {
  const extender = startSandboxTimeoutExtender({
    sandboxName: process.env.VERCEL_SANDBOX_NAME,
  });

  const runResult = await pendingRunFromApi(config, args.runId, args.organizationId);
  let exitCode: number;
  if (Result.isError(runResult)) {
    console.error("[cloud-worker] run-once failed", runResult.error.message);
    exitCode = infrastructureResultToExitCode(runResult);
  } else {
    const result = await executeCloudRun(config, runResult.value);
    exitCode = infrastructureResultToExitCode(result);
  }

  extender.stop();
  const stopResult = await stopSandboxIfPresent();
  if (Result.isError(stopResult)) {
    console.warn("[cloud-worker] sandbox stop failed", stopResult.error.message);
  }

  return exitCode;
}
