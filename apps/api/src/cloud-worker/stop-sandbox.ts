import { Sandbox } from "@vercel/sandbox";

export async function stopDispatchedSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop({ blocking: true });
}
