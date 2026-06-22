import { randomUUID } from "node:crypto";
import { and, eq, sql, type Database } from "@openharness/db";
import { teamsChannelRepoMapping, teamsInstallation } from "@openharness/db/schema";
import { decryptSecret, encryptSecret } from "./teams-crypto.js";

export type TeamsInstallationRecord = {
  id: string;
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
  userId: string;
  installationId: string;
  teamId: string;
  channelId: string;
  channelName: string;
  githubOwner: string;
  githubRepo: string;
  conversationId: string | null;
  serviceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapInstallation(row: typeof teamsInstallation.$inferSelect): TeamsInstallationRecord {
  return {
    id: row.id,
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
    userId: row.userId,
    installationId: row.installationId,
    teamId: row.teamId,
    channelId: row.channelId,
    channelName: row.channelName,
    githubOwner: row.githubOwner,
    githubRepo: row.githubRepo,
    conversationId: row.conversationId,
    serviceUrl: row.serviceUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTeamsInstallationsForUser(
  db: Database,
  userId: string,
): Promise<TeamsInstallationRecord[]> {
  const rows = await db
    .select()
    .from(teamsInstallation)
    .where(eq(teamsInstallation.userId, userId));
  return rows.map(mapInstallation);
}

export async function getTeamsInstallationForUserTeam(
  db: Database,
  userId: string,
  teamId: string,
): Promise<(TeamsInstallationRecord & { accessToken: string }) | null> {
  const rows = await db
    .select()
    .from(teamsInstallation)
    .where(and(eq(teamsInstallation.userId, userId), eq(teamsInstallation.teamId, teamId)))
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
      and(eq(teamsInstallation.userId, input.userId), eq(teamsInstallation.teamId, input.teamId)),
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
      .set(values)
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

export async function listChannelMappingsForUser(
  db: Database,
  userId: string,
): Promise<TeamsChannelRepoMappingRecord[]> {
  const rows = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(eq(teamsChannelRepoMapping.userId, userId));
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
  userId: string,
  owner: string,
  repo: string,
): Promise<TeamsChannelRepoMappingRecord | null> {
  const rows = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(
      and(
        eq(teamsChannelRepoMapping.userId, userId),
        sql`lower(${teamsChannelRepoMapping.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${teamsChannelRepoMapping.githubRepo}) = ${repo.toLowerCase()}`,
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? mapChannelMapping(row) : null;
}

export async function upsertChannelRepoMapping(
  db: Database,
  input: {
    userId: string;
    installationId: string;
    teamId: string;
    channelId: string;
    channelName: string;
    githubOwner: string;
    githubRepo: string;
    conversationId?: string | null;
    serviceUrl?: string | null;
  },
): Promise<TeamsChannelRepoMappingRecord> {
  const existingByRepo = await findChannelMappingForRepo(
    db,
    input.userId,
    input.githubOwner,
    input.githubRepo,
  );
  const existingByChannel = await db
    .select()
    .from(teamsChannelRepoMapping)
    .where(
      and(
        eq(teamsChannelRepoMapping.userId, input.userId),
        eq(teamsChannelRepoMapping.channelId, input.channelId),
      ),
    )
    .limit(1);

  const values = {
    installationId: input.installationId,
    teamId: input.teamId,
    channelId: input.channelId,
    channelName: input.channelName,
    githubOwner: input.githubOwner,
    githubRepo: input.githubRepo,
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
      .set(values)
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
  userId: string,
  mappingId: string,
): Promise<boolean> {
  const result = await db
    .delete(teamsChannelRepoMapping)
    .where(
      and(
        eq(teamsChannelRepoMapping.id, mappingId),
        eq(teamsChannelRepoMapping.userId, userId),
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
