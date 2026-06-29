export async function stopSandboxIfPresent(): Promise<void> {
  const sandboxId = process.env.VERCEL_SANDBOX_ID?.trim();
  if (!sandboxId) {
    return;
  }

  try {
    const { Sandbox } = await import("@vercel/sandbox");
    const sandbox = await Sandbox.get({ sandboxId });
    await sandbox.stop({ blocking: true });
    console.log("[cloud-worker] stopped sandbox", { sandboxId });
  } catch (err) {
    console.warn(
      "[cloud-worker] sandbox stop failed",
      err instanceof Error ? err.message : err,
    );
  }
}
