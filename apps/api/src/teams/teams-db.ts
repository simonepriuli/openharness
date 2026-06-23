import { randomUUID } from "node:crypto";
import { and, eq, sql, type Database } from "@openharness/db";
import { teamsChannelRepoMapping, teamsInstallation } from "@openharness/db/schema";
import { decryptSecret, encryptSecret } from "./teams-crypto.js";

export type TeamsInstallationRecord = {
  id: string;
  organizationId: string;
  userId: string;
  tenantId: string;
  teamId: string;
  teamName: string;
  serviceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamsChannelRepoMappingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  installationId: string;
  teamId: string;
  channelId: string;
  channelName: string;
  provider: string;
  namespace: string;
  repoName: string;
  githubOwner: string;
  githubRepo: string;
  projectSourceControlConnectionId: string | null;
  conversationId: string | null;
  serviceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapInstallation(row: typeof teamsInstallation.$inferSelect): TeamsInstallationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    tenantId: row.tenantId,
    teamId: row.teamId,
    teamName: row.teamName,
    serviceUrl: row.serviceUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapChannelMapping(
  row: typeof teamsChannelRepoMapping.$inferSelect,
): TeamsChannelRepoMappingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    installationId: row.installationId,
    teamId: row.teamId,
    channelId: row.channelId,
    channelName: row.channelName,
    provider: row.provider,
    namespace: row.namespace,
    repoName: row.repoName,
    githubOwner: row.namespace,
    githubRepo: row.repoName,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
    conversationId: row.conversationId,
    serviceUrl: row.serviceUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTeamsInstallationsForOrg(
  db: Database,
  organizationId: string,
): Promise<TeamsInstallationRecord[]> {
  const rows = await db
    .select()
    .from(teamsInstallation)
    .where(eq(teamsInstallation.organizationId, organizationId));
  return rows.map(mapInstallation);
}

export async function getTeamsInstallationForOrgTeam(
  db: Database,
  organizationId: string,
  teamId: string,
): Promise<(TeamsInstallationRecord & { accessToken: string }) | null> {
  const rows = await db
    .select()
    .from(teamsInstallation)
    .where(
      and(eq(teamsInstallation.organizationId, organizationId), eq(teamsInstallation.teamId, teamId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapInstallation(row),
    accessToken: decryptSecret(row.accessTokenEncrypted),
  };
}

export async function upsertTeamsInstallation(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    tenantId: string;
    teamId: string;
    teamName: string;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    serviceUrl?: string | null;
  },
): Promise<TeamsInstallationRecord> {
  const existing = await db
    .select()
    .from(teamsInstallation)
    .where(
      and(
        eq(teamsInstallation.organizationId, input.organizationId),
        eq(teamsInstallation.teamId, input.teamId),
      ),
    )
    .limit(1);

  const values = {
    tenantId: input.tenantId,
    teamName: input.teamName,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    serviceUrl: input.serviceUrl ?? null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(teamsInstallation)
      .set({ ...values, userId: input.userId })
      .where(eq(teamsInstallation.id, existing[0].id));
    const updated = await db
      .select()
      .from(teamsInstallation)
      .where(eq(teamsInstallation.id, existing[0].id))
      .limit(1);
    return mapInstallation(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(teamsInstallation).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    teamId: input.teamId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(teamsInstallation)
    .where(eq(teamsInstallation.id, id))
    .limit(1);
  return mapInstallation(inserted[0]!);
}

export async function listChannelMappingsForOrg(
  db: Database,
  organizationId: string,
): Promise<TeamsChannelRepoMappingRecord[]> {
  const rows = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(eq(teamsChannelRepoMapping.organizationId, organizationId));
  return rows.map(mapChannelMapping);
}

export async function findChannelMappingByChannelId(
  db: Database,
  channelId: string,
): Promise<TeamsChannelRepoMappingRecord | null> {
  const rows = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(eq(teamsChannelRepoMapping.channelId, channelId))
    .limit(1);
  const row = rows[0];
  return row ? mapChannelMapping(row) : null;
}

export async function findChannelMappingForRepo(
  db: Database,
  organizationId: string,
  owner: string,
  repo: string,
  provider?: string,
): Promise<TeamsChannelRepoMappingRecord | null> {
  const conditions = [
    eq(teamsChannelRepoMapping.organizationId, organizationId),
    sql`lower(${teamsChannelRepoMapping.namespace}) = ${owner.toLowerCase()}`,
    sql`lower(${teamsChannelRepoMapping.repoName}) = ${repo.toLowerCase()}`,
  ];
  if (provider) {
    conditions.push(eq(teamsChannelRepoMapping.provider, provider));
  }

  const rows = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(and(...conditions))
    .limit(1);
  const row = rows[0];
  return row ? mapChannelMapping(row) : null;
}

export async function upsertChannelRepoMapping(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    installationId: string;
    teamId: string;
    channelId: string;
    channelName: string;
    provider: string;
    namespace: string;
    repoName: string;
    githubOwner?: string;
    githubRepo?: string;
    projectSourceControlConnectionId?: string | null;
    conversationId?: string | null;
    serviceUrl?: string | null;
  },
): Promise<TeamsChannelRepoMappingRecord> {
  const namespace = input.namespace ?? input.githubOwner ?? "";
  const repoName = input.repoName ?? input.githubRepo ?? "";

  const existingByRepo = await findChannelMappingForRepo(
    db,
    input.organizationId,
    namespace,
    repoName,
    input.provider,
  );
  const existingByChannel = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(
      and(
        eq(teamsChannelRepoMapping.organizationId, input.organizationId),
        eq(teamsChannelRepoMapping.channelId, input.channelId),
      ),
    )
    .limit(1);

  const values = {
    installationId: input.installationId,
    teamId: input.teamId,
    channelId: input.channelId,
    channelName: input.channelName,
    provider: input.provider,
    namespace,
    repoName,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId ?? null,
    conversationId: input.conversationId ?? existingByRepo?.conversationId ?? null,
    serviceUrl: input.serviceUrl ?? existingByRepo?.serviceUrl ?? null,
    updatedAt: new Date(),
  };

  if (existingByChannel[0] && existingByChannel[0].id !== existingByRepo?.id) {
    await db
      .delete(teamsChannelRepoMapping)
      .where(eq(teamsChannelRepoMapping.id, existingByChannel[0].id));
  }

  if (existingByRepo) {
    await db
      .update(teamsChannelRepoMapping)
      .set({ ...values, userId: input.userId })
      .where(eq(teamsChannelRepoMapping.id, existingByRepo.id));
    const updated = await db
      .select()
      .from(teamsChannelRepoMapping)
      .where(eq(teamsChannelRepoMapping.id, existingByRepo.id))
      .limit(1);
    return mapChannelMapping(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(teamsChannelRepoMapping).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(eq(teamsChannelRepoMapping.id, id))
    .limit(1);
  return mapChannelMapping(inserted[0]!);
}

export async function deleteChannelMapping(
  db: Database,
  organizationId: string,
  mappingId: string,
): Promise<boolean> {
  const result = await db
    .delete(teamsChannelRepoMapping)
    .where(
      and(
        eq(teamsChannelRepoMapping.id, mappingId),
        eq(teamsChannelRepoMapping.organizationId, organizationId),
      ),
    );
  return (result as { rowCount?: number }).rowCount !== 0;
}

export async function updateChannelConversationRef(
  db: Database,
  mappingId: string,
  conversationId: string,
  serviceUrl: string,
): Promise<void> {
  await db
    .update(teamsChannelRepoMapping)
    .set({
      conversationId,
      serviceUrl,
      updatedAt: new Date(),
    })
    .where(eq(teamsChannelRepoMapping.id, mappingId));
}

export async function getInstallationAccessToken(
  db: Database,
  installationId: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(teamsInstallation)
    .where(eq(teamsInstallation.id, installationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return decryptSecret(row.accessTokenEncrypted);
}

/** @deprecated */
export const listTeamsInstallationsForUser = listTeamsInstallationsForOrg;
export const getTeamsInstallationForUserTeam = getTeamsInstallationForOrgTeam;
export const listChannelMappingsForUser = listChannelMappingsForOrg;
