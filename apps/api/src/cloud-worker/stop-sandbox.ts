import { Result } from "better-result";
import { getSandboxByName, stopSandbox } from "./sandbox-client.js";

export async function stopDispatchedSandbox(sandboxName: string): Promise<void> {
  const sandboxResult = await getSandboxByName(sandboxName);
  if (Result.isError(sandboxResult)) throw sandboxResult.error;
  await stopSandbox(sandboxResult.value);
}

/** Best-effort stop for issue workspace cleanup; logs and swallows errors. */
export async function stopIssueWorkspaceSandboxBestEffort(
  sandboxName: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await stopDispatchedSandbox(sandboxName);
  } catch (err) {
    console.warn("[linear-agent/workspace] failed to stop sandbox", {
      sandboxName,
      ...context,
      err: err instanceof Error ? err.message : err,
    });
  }
}
