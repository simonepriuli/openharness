import { getSandboxByName, stopSandbox } from "./sandbox-client.js";

export async function stopDispatchedSandbox(sandboxName: string): Promise<void> {
  const sandbox = await getSandboxByName(sandboxName);
  await stopSandbox(sandbox);
}
