import { randomUUID } from "node:crypto";
import { and, eq } from "@openharness/db";
import {
  projectSourceControlConnection,
  sourceControlConnection,
  sourceControlRepo,
} from "@openharness/db/schema";
import { env } from "../env.js";
import { decryptSecret, encryptSecret } from "../teams/teams-crypto.js";
import { unwrapResult } from "../result-helpers.js";
import { AzureDevOpsClient } from "./client.js";

const ADO_PROVIDER = "azure_devops" as const;

const HOOK_EVENTS = [
  "git.pullrequest.created",
  "git.pullrequest.updated",
  "ms.vss-code.git-pullrequest-comment-event",
  "ms.vss-code.git-pullrequest-review-event",
] as const;

export function webhookUrl(): string {
  return `${env.betterAuthUrl()}/api/azure-devops/webhook`;
}

export async function getAdoConnectionForOrg(
  db: Parameters<typeof getAdoClientForOrg>[0],
  organizationId: string,
) {
  const rows = await db
    .select()
    .from(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.organizationId, organizationId),
        eq(sourceControlConnection.provider, ADO_PROVIDER),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getAdoClientForOrg(
  db: import("@openharness/db").Database,
  organizationId: string,
): Promise<{ client: AzureDevOpsClient; connection: typeof sourceControlConnection.$inferSelect } | null> {
  const connection = await getAdoConnectionForOrg(db, organizationId);
  if (!connection?.credentialsEncrypted) return null;

  const pat = decryptSecret(connection.credentialsEncrypted);
  const orgName = connection.externalOrgId;
  return { client: new AzureDevOpsClient(orgName, pat), connection };
}

export async function connectAzureDevOpsOrg(
  db: import("@openharness/db").Database,
  organizationId: string,
  userId: string,
  orgName: string,
  pat: string,
): Promise<{ connectionId: string; displayName: string; repoCount: number }> {
  const normalizedOrg = orgName.trim().toLowerCase();
  const client = new AzureDevOpsClient(normalizedOrg, pat.trim());
  const validation = unwrapResult(await client.validateConnection());
  const profileId = validation.profileId;

  const repos = unwrapResult(await client.listAllRepositories());
  const encryptedPat = encryptSecret(pat.trim());

  const existing = await getAdoConnectionForOrg(db, organizationId);
  let connectionId: string;

  if (existing) {
    connectionId = existing.id;
    await db
      .update(sourceControlConnection)
      .set({
        userId,
        externalOrgId: normalizedOrg,
        displayName: normalizedOrg,
        credentialsEncrypted: encryptedPat,
        metadata: { authenticatedUser: validation.authenticatedUser, automationUserId: profileId },
        updatedAt: new Date(),
      })
      .where(eq(sourceControlConnection.id, connectionId));
  } else {
    connectionId = randomUUID();
    await db.insert(sourceControlConnection).values({
      id: connectionId,
      provider: ADO_PROVIDER,
      organizationId,
      userId,
      externalOrgId: normalizedOrg,
      displayName: normalizedOrg,
      credentialsEncrypted: encryptedPat,
      metadata: { authenticatedUser: validation.authenticatedUser, automationUserId: profileId },
    });
  }

  await db.delete(sourceControlRepo).where(eq(sourceControlRepo.connectionId, connectionId));

  if (repos.length > 0) {
    await db.insert(sourceControlRepo).values(
      repos.map((repo) => ({
        id: randomUUID(),
        connectionId,
        externalRepoId: repo.id,
        namespace: repo.project.name,
        name: repo.name,
        fullName: `${repo.project.name}/${repo.name}`,
        metadata: { projectId: repo.project.id, remoteUrl: repo.remoteUrl },
      })),
    );
  }

  return {
    connectionId,
    displayName: normalizedOrg,
    repoCount: repos.length,
  };
}

export async function disconnectAzureDevOpsOrg(
  db: import("@openharness/db").Database,
  organizationId: string,
): Promise<void> {
  await db
    .delete(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.organizationId, organizationId),
        eq(sourceControlConnection.provider, ADO_PROVIDER),
      ),
    );
}

export async function provisionServiceHooks(
  db: import("@openharness/db").Database,
  organizationId: string,
  projectConnectionId: string,
): Promise<void> {
  const ctx = await getAdoClientForOrg(db, organizationId);
  if (!ctx) return;

  const { client, connection } = ctx;
  const projectConn = await db
    .select()
    .from(projectSourceControlConnection)
    .where(eq(projectSourceControlConnection.id, projectConnectionId))
    .limit(1);

  const row = projectConn[0];
  if (!row || row.provider !== ADO_PROVIDER) return;

  const repoRows = await db
    .select()
    .from(sourceControlRepo)
    .where(
      and(
        eq(sourceControlRepo.connectionId, connection.id),
        eq(sourceControlRepo.namespace, row.namespace),
        eq(sourceControlRepo.name, row.name),
      ),
    )
    .limit(1);

  const repo = repoRows[0];
  if (!repo) return;

  const metadata = (repo.metadata ?? {}) as Record<string, string>;
  const projectId = metadata.projectId;
  if (!projectId) return;

  const existingHooks = ((row.metadata ?? {}) as { serviceHookIds?: string[] }).serviceHookIds ?? [];
  for (const hookId of existingHooks) {
    try {
      unwrapResult(await client.deleteServiceHookSubscription(hookId));
    } catch {
      // ignore cleanup failures
    }
  }

  const hookIds: string[] = [];
  const url = webhookUrl();

  for (const eventType of HOOK_EVENTS) {
    const subscription = unwrapResult(
      await client.createServiceHookSubscription(projectId, eventType, url, repo.externalRepoId),
    );
    hookIds.push(subscription.id);
  }

  await db
    .update(projectSourceControlConnection)
    .set({
      metadata: { ...((row.metadata ?? {}) as Record<string, unknown>), serviceHookIds: hookIds },
      updatedAt: new Date(),
    })
    .where(eq(projectSourceControlConnection.id, projectConnectionId));
}

export async function deprovisionServiceHooks(
  db: import("@openharness/db").Database,
  organizationId: string,
  projectConnectionId: string,
): Promise<void> {
  const ctx = await getAdoClientForOrg(db, organizationId);
  if (!ctx) return;

  const { client } = ctx;
  const projectConn = await db
    .select()
    .from(projectSourceControlConnection)
    .where(eq(projectSourceControlConnection.id, projectConnectionId))
    .limit(1);

  const row = projectConn[0];
  if (!row) return;

  const hookIds = ((row.metadata ?? {}) as { serviceHookIds?: string[] }).serviceHookIds ?? [];
  for (const hookId of hookIds) {
    try {
      unwrapResult(await client.deleteServiceHookSubscription(hookId));
    } catch {
      // ignore
    }
  }
}
