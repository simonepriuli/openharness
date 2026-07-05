import { createHmac, timingSafeEqual } from "node:crypto";
import { Result } from "better-result";
import { eq, type Database } from "@openharness/db";
import { sourceControlConnection } from "@openharness/db/schema";
import { env } from "../env.js";
import { bestEffortAsync, parseJson } from "../result-helpers.js";
import { clearInstallationTokenCache } from "./app-auth.js";
import {
  deleteInstallation,
  syncInstallationRepos,
  upsertInstallationForOrg,
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

  const parsed = parseJson(rawBody);
  if (Result.isError(parsed)) {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }
  const payload = parsed.value as WebhookPayload;

  const installation = payload.installation;
  const action = payload.action ?? "";

  if (eventName && deliveryId && installation?.id) {
    await bestEffortAsync("[github/webhook] workflow event failed", () =>
      handleWorkflowWebhookEvent(
        db,
        eventName,
        deliveryId,
        payload as WorkflowWebhookPayload,
      ),
    );
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
      .select({
        organizationId: sourceControlConnection.organizationId,
        userId: sourceControlConnection.userId,
      })
      .from(sourceControlConnection)
      .where(
        eq(sourceControlConnection.externalOrgId, installationId),
      )
      .limit(1);
    const existing = existingRows[0];

    if (existing) {
      await upsertInstallationForOrg(
        db,
        existing.organizationId,
        existing.userId,
        installation,
      );
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
      .select({ externalOrgId: sourceControlConnection.externalOrgId })
      .from(sourceControlConnection)
      .where(eq(sourceControlConnection.externalOrgId, installationId))
      .limit(1);
    if (registeredRows[0]) {
      await syncInstallationRepos(db, installationId);
    }
  }

  return { ok: true };
}
