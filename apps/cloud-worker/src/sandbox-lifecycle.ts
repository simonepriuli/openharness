export async function stopSandboxIfPresent(): Promise<void> {
  const sandboxName =
    process.env.VERCEL_SANDBOX_NAME?.trim() || process.env.VERCEL_SANDBOX_ID?.trim();
  if (!sandboxName) {
    return;
  }

  const apiUrl = process.env.OPENHARNESS_API_URL?.trim()?.replace(/\/$/, "");
  const secret = process.env.CLOUD_WORKER_SECRET?.trim();
  if (!apiUrl || !secret) {
    console.warn("[cloud-worker] cannot stop sandbox: missing OPENHARNESS_API_URL or CLOUD_WORKER_SECRET");
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/api/internal/workflow-runs/sandboxes/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sandboxName }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API stop failed (${response.status})${text ? `: ${text}` : ""}`);
    }
    console.log("[cloud-worker] stopped sandbox via API", { sandboxName });
  } catch (err) {
    console.warn(
      "[cloud-worker] sandbox stop failed",
      err instanceof Error ? err.message : err,
    );
  }
}
