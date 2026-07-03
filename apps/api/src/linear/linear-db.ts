import { randomUUID } from "node:crypto";
import { and, desc, eq, sql, type Database } from "@openharness/db";
import { linearInstallation, linearProjectRepoMapping } from "@openharness/db/schema";
import { decryptSecret, encryptSecret } from "./linear-crypto.js";

export type LinearInstallationRecord = {
  id: string;
  organizationId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  webhookId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinearProjectRepoMappingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  installationId: string;
  projectId: string;
  projectName: string;
  provider: string;
  namespace: string;
  repoName: string;
  githubOwner: string;
  githubRepo: string;
  projectSourceControlConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type InstallationRow = typeof linearInstallation.$inferSelect;

function mapInstallation(row: InstallationRow): LinearInstallationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    webhookId: row.webhookId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapProjectMapping(
  row: typeof linearProjectRepoMapping.$inferSelect,
): LinearProjectRepoMappingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    installationId: row.installationId,
    projectId: row.projectId,
    projectName: row.projectName,
    provider: row.provider,
    namespace: row.namespace,
    repoName: row.repoName,
    githubOwner: row.namespace,
    githubRepo: row.repoName,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listLinearInstallationsForOrg(
  db: Database,
  organizationId: string,
): Promise<LinearInstallationRecord[]> {
  const rows = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.organizationId, organizationId))
    .orderBy(desc(linearInstallation.updatedAt));
  return rows.map(mapInstallation);
}

export async function getLinearInstallationForOrg(
  db: Database,
  organizationId: string,
): Promise<LinearInstallationRecord | null> {
  const rows = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.organizationId, organizationId))
    .orderBy(desc(linearInstallation.updatedAt))
    .limit(1);
  const row = rows[0];
  return row ? mapInstallation(row) : null;
}

export async function getLinearInstallationWithTokens(
  db: Database,
  organizationId: string,
): Promise<
  | (LinearInstallationRecord & {
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
      webhookSecret: string | null;
    })
  | null
> {
  const rows = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.organizationId, organizationId))
    .orderBy(desc(linearInstallation.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapInstallation(row),
    accessToken: decryptSecret(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decryptSecret(row.refreshTokenEncrypted) : null,
    tokenExpiresAt: row.tokenExpiresAt,
    webhookSecret: row.webhookSecretEncrypted ? decryptSecret(row.webhookSecretEncrypted) : null,
  };
}

export async function getLinearInstallationByWebhookId(
  db: Database,
  webhookId: string,
): Promise<
  | (LinearInstallationRecord & {
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
      webhookSecret: string | null;
    })
  | null
> {
  const rows = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.webhookId, webhookId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapInstallation(row),
    accessToken: decryptSecret(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decryptSecret(row.refreshTokenEncrypted) : null,
    tokenExpiresAt: row.tokenExpiresAt,
    webhookSecret: row.webhookSecretEncrypted ? decryptSecret(row.webhookSecretEncrypted) : null,
  };
}

export async function getLinearInstallationByWorkspaceId(
  db: Database,
  workspaceId: string,
): Promise<
  | (LinearInstallationRecord & {
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
      webhookSecret: string | null;
    })
  | null
> {
  const rows = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.workspaceId, workspaceId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapInstallation(row),
    accessToken: decryptSecret(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decryptSecret(row.refreshTokenEncrypted) : null,
    tokenExpiresAt: row.tokenExpiresAt,
    webhookSecret: row.webhookSecretEncrypted ? decryptSecret(row.webhookSecretEncrypted) : null,
  };
}

export async function upsertLinearInstallation(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    workspaceId: string;
    workspaceName: string;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    webhookId?: string | null;
    webhookSecret?: string | null;
  },
): Promise<LinearInstallationRecord> {
  const existing = await db
    .select()
    .from(linearInstallation)
    .where(
      and(
        eq(linearInstallation.organizationId, input.organizationId),
        eq(linearInstallation.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  const values = {
    workspaceName: input.workspaceName,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    webhookId: input.webhookId ?? existing[0]?.webhookId ?? null,
    webhookSecretEncrypted:
      input.webhookSecret !== undefined
        ? input.webhookSecret
          ? encryptSecret(input.webhookSecret)
          : null
        : (existing[0]?.webhookSecretEncrypted ?? null),
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(linearInstallation)
      .set({ ...values, userId: input.userId })
      .where(eq(linearInstallation.id, existing[0].id));
    const updated = await db
      .select()
      .from(linearInstallation)
      .where(eq(linearInstallation.id, existing[0].id))
      .limit(1);
    return mapInstallation(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(linearInstallation).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(linearInstallation)
    .where(eq(linearInstallation.id, id))
    .limit(1);
  return mapInstallation(inserted[0]!);
}

export async function updateLinearInstallationTokens(
  db: Database,
  installationId: string,
  input: {
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(linearInstallation)
    .set({
      accessTokenEncrypted: encryptSecret(input.accessToken),
      refreshTokenEncrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(linearInstallation.id, installationId));
}

export async function deleteLinearInstallation(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  const result = await db
    .delete(linearInstallation)
    .where(eq(linearInstallation.organizationId, organizationId));
  return (result as { rowCount?: number }).rowCount !== 0;
}

export async function listLinearMappingsForOrg(
  db: Database,
  organizationId: string,
): Promise<LinearProjectRepoMappingRecord[]> {
  const rows = await db
    .select()
    .from(linearProjectRepoMapping)
    .where(eq(linearProjectRepoMapping.organizationId, organizationId));
  return rows.map(mapProjectMapping);
}

export async function findLinearMappingByProjectId(
  db: Database,
  organizationId: string,
  projectId: string,
): Promise<LinearProjectRepoMappingRecord | null> {
  const rows = await db
    .select()
    .from(linearProjectRepoMapping)
    .where(
      and(
        eq(linearProjectRepoMapping.organizationId, organizationId),
        eq(linearProjectRepoMapping.projectId, projectId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? mapProjectMapping(row) : null;
}

export async function findLinearMappingForRepo(
  db: Database,
  organizationId: string,
  owner: string,
  repo: string,
  provider?: string,
): Promise<LinearProjectRepoMappingRecord | null> {
  const conditions = [
    eq(linearProjectRepoMapping.organizationId, organizationId),
    sql`lower(${linearProjectRepoMapping.namespace}) = ${owner.toLowerCase()}`,
    sql`lower(${linearProjectRepoMapping.repoName}) = ${repo.toLowerCase()}`,
  ];
  if (provider) conditions.push(eq(linearProjectRepoMapping.provider, provider));

  const rows = await db
    .select()
    .from(linearProjectRepoMapping)
    .where(and(...conditions))
    .limit(1);
  const row = rows[0];
  return row ? mapProjectMapping(row) : null;
}

export async function upsertLinearProjectRepoMapping(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    installationId: string;
    projectId: string;
    projectName: string;
    provider: string;
    namespace: string;
    repoName: string;
    projectSourceControlConnectionId?: string | null;
  },
): Promise<LinearProjectRepoMappingRecord> {
  const existingByProject = await findLinearMappingByProjectId(
    db,
    input.organizationId,
    input.projectId,
  );
  const existingByRepo = await findLinearMappingForRepo(
    db,
    input.organizationId,
    input.namespace,
    input.repoName,
    input.provider,
  );

  const values = {
    installationId: input.installationId,
    projectId: input.projectId,
    projectName: input.projectName,
    provider: input.provider,
    namespace: input.namespace,
    repoName: input.repoName,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId ?? null,
    updatedAt: new Date(),
  };

  if (existingByRepo && existingByRepo.id !== existingByProject?.id) {
    await db
      .delete(linearProjectRepoMapping)
      .where(eq(linearProjectRepoMapping.id, existingByRepo.id));
  }

  if (existingByProject) {
    await db
      .update(linearProjectRepoMapping)
      .set({ ...values, userId: input.userId })
      .where(eq(linearProjectRepoMapping.id, existingByProject.id));
    const updated = await db
      .select()
      .from(linearProjectRepoMapping)
      .where(eq(linearProjectRepoMapping.id, existingByProject.id))
      .limit(1);
    return mapProjectMapping(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(linearProjectRepoMapping).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(linearProjectRepoMapping)
    .where(eq(linearProjectRepoMapping.id, id))
    .limit(1);
  return mapProjectMapping(inserted[0]!);
}

export async function deleteLinearProjectMapping(
  db: Database,
  organizationId: string,
  mappingId: string,
): Promise<boolean> {
  const result = await db
    .delete(linearProjectRepoMapping)
    .where(
      and(
        eq(linearProjectRepoMapping.id, mappingId),
        eq(linearProjectRepoMapping.organizationId, organizationId),
      ),
    );
  return (result as { rowCount?: number }).rowCount !== 0;
}
