import { Result } from "better-result";
import type { SandboxError } from "../errors.js";
import { toSandboxError } from "../result-helpers.js";
import { getSandboxByName, stopSandbox } from "./sandbox-client.js";

export async function stopDispatchedSandbox(
  sandboxName: string,
): Promise<Result<void, SandboxError>> {
  return Result.tryPromise({
    try: async () => {
      const sandbox = await getSandboxByName(sandboxName);
      await stopSandbox(sandbox);
    },
    catch: (cause) => toSandboxError(cause),
  });
}
