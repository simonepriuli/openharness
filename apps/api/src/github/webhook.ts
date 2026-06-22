import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, type Database } from "@openharness/db";
import { githubInstallation } from "@openharness/db/schema";
import { env } from "../env.js";
import { clearInstallationTokenCache } from "./app-auth.js";
import {
  deleteInstallation,
  syncInstallationRepos,
  upsertInstallationForUser,
  type GithubInstallationPayload,
  type GithubRepoPayload,
} from "./sync.js";
import { handleWorkflowWebhookEvent, type WorkflowWebhookPayload } from "./workflow-webhook.js";

function verifyWebhookSignature(body: string, signatureHeader: string | undefined): boolean {
  const secret = env.githubAppWebhookSecret();
  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(body).digest("hex");
  const expected = `sha256=${digest}`;
  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

type WebhookPayload = {
  action?: string;
  installation?: GithubInstallationPayload;
  repositories_added?: GithubRepoPayload[];
  repositories_removed?: GithubRepoPayload[];
};

export async function handleGithubWebhook(
  db: Database,
  rawBody: string,
  signatureHeader: string | undefined,
  eventName?: string,
  deliveryId?: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return { ok: false, status: 401, message: "Invalid webhook signature" };
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }

  const installation = payload.installation;
  const action = payload.action ?? "";

  if (eventName && deliveryId && installation?.id) {
    try {
      await handleWorkflowWebhookEvent(
        db,
        eventName,
        deliveryId,
        payload as WorkflowWebhookPayload,
      );
    } catch (err) {
      console.error("[github/webhook] workflow event failed", err);
    }
  }

  if (!installation?.id) {
    return { ok: true };
  }

  const installationId = String(installation.id);

  if (action === "deleted") {
    clearInstallationTokenCache(installationId);
    await deleteInstallation(db, installationId);
    return { ok: true };
  }

  if (action === "created" || action === "added") {
    const existingRows = await db
      .select({ userId: githubInstallation.userId })
      .from(githubInstallation)
      .where(eq(githubInstallation.installationId, installationId))
      .limit(1);
    const existing = existingRows[0];

    if (existing) {
      await upsertInstallationForUser(db, existing.userId, installation);
    }
  }

  if (
    action === "created" ||
    action === "added" ||
    action === "removed" ||
    payload.repositories_added?.length ||
    payload.repositories_removed?.length
  ) {
    const registeredRows = await db
      .select({ installationId: githubInstallation.installationId })
      .from(githubInstallation)
      .where(eq(githubInstallation.installationId, installationId))
      .limit(1);
    if (registeredRows[0]) {
      await syncInstallationRepos(db, installationId);
    }
  }

  return { ok: true };
}
