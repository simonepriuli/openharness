import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, type Database } from "@openharness/db";
import { sourceControlConnection } from "@openharness/db/schema";
import { Result } from "better-result";
import { env } from "../env.js";
import { WebhookError } from "../errors.js";
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
): Promise<Result<void, WebhookError>> {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return Result.err(
      new WebhookError({ status: 401, message: "Invalid webhook signature" }),
    );
  }

  const payloadResult = Result.try({
    try: () => JSON.parse(rawBody) as WebhookPayload,
    catch: () => new WebhookError({ status: 400, message: "Invalid JSON" }),
  });
  if (Result.isError(payloadResult)) {
    return payloadResult;
  }
  const payload = payloadResult.value;

  const installation = payload.installation;
  const action = payload.action ?? "";

  if (eventName && deliveryId && installation?.id) {
    const workflowResult = await Result.tryPromise({
      try: () =>
        handleWorkflowWebhookEvent(
          db,
          eventName,
          deliveryId,
          payload as WorkflowWebhookPayload,
        ),
      catch: (cause) => cause,
    });
    if (Result.isError(workflowResult)) {
      console.error("[github/webhook] workflow event failed", workflowResult.error);
    }
  }

  if (!installation?.id) {
    return Result.ok(undefined);
  }

  const installationId = String(installation.id);

  if (action === "deleted") {
    clearInstallationTokenCache(installationId);
    await deleteInstallation(db, installationId);
    return Result.ok(undefined);
  }

  if (action === "created" || action === "added") {
    const existingRows = await db
      .select({
        organizationId: sourceControlConnection.organizationId,
        userId: sourceControlConnection.userId,
      })
      .from(sourceControlConnection)
      .where(eq(sourceControlConnection.externalOrgId, installationId))
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

  return Result.ok(undefined);
}
