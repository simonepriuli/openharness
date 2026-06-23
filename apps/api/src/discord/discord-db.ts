import { randomUUID } from "node:crypto";
import { and, desc, eq, sql, type Database } from "@openharness/db";
import { discordChannelRepoMapping, discordInstallation } from "@openharness/db/schema";
import { decryptSecret, encryptSecret } from "../teams/teams-crypto.js";

export type DiscordInstallationRecord = {
  id: string;
  organizationId: string;
  userId: string;
  guildId: string;
  guildName: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscordChannelRepoMappingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  installationId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  provider: string;
  namespace: string;
  repoName: string;
  githubOwner: string;
  githubRepo: string;
  projectSourceControlConnectionId: string | null;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapInstallation(row: typeof discordInstallation.$inferSelect): DiscordInstallationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    guildId: row.guildId,
    guildName: row.guildName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapChannelMapping(
  row: typeof discordChannelRepoMapping.$inferSelect,
): DiscordChannelRepoMappingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    installationId: row.installationId,
    guildId: row.guildId,
    channelId: row.channelId,
    channelName: row.channelName,
    provider: row.provider,
    namespace: row.namespace,
    repoName: row.repoName,
    githubOwner: row.namespace,
    githubRepo: row.repoName,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
    threadId: row.threadId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDiscordInstallationsForOrg(
  db: Database,
  organizationId: string,
): Promise<DiscordInstallationRecord[]> {
  const rows = await db
    .select()
    .from(discordInstallation)
    .where(eq(discordInstallation.organizationId, organizationId))
    .orderBy(desc(discordInstallation.updatedAt));
  return rows.map(mapInstallation);
}

export async function getDiscordInstallationForOrgGuild(
  db: Database,
  organizationId: string,
  guildId: string,
): Promise<(DiscordInstallationRecord & { accessToken: string }) | null> {
  const rows = await db
    .select()
    .from(discordInstallation)
    .where(
      and(
        eq(discordInstallation.organizationId, organizationId),
        eq(discordInstallation.guildId, guildId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapInstallation(row),
    accessToken: decryptSecret(row.accessTokenEncrypted),
  };
}

export async function upsertDiscordInstallation(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    guildId: string;
    guildName: string;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
  },
): Promise<DiscordInstallationRecord> {
  const existing = await db
    .select()
    .from(discordInstallation)
    .where(
      and(
        eq(discordInstallation.organizationId, input.organizationId),
        eq(discordInstallation.guildId, input.guildId),
      ),
    )
    .limit(1);

  const values = {
    guildName: input.guildName,
    accessTokenEncrypted: encryptSecret(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(discordInstallation)
      .set({ ...values, userId: input.userId })
      .where(eq(discordInstallation.id, existing[0].id));
    const updated = await db
      .select()
      .from(discordInstallation)
      .where(eq(discordInstallation.id, existing[0].id))
      .limit(1);
    return mapInstallation(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(discordInstallation).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    guildId: input.guildId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(discordInstallation)
    .where(eq(discordInstallation.id, id))
    .limit(1);
  return mapInstallation(inserted[0]!);
}

export async function listDiscordMappingsForOrg(
  db: Database,
  organizationId: string,
): Promise<DiscordChannelRepoMappingRecord[]> {
  const rows = await db
    .select()
    .from(discordChannelRepoMapping)
    .where(eq(discordChannelRepoMapping.organizationId, organizationId));
  return rows.map(mapChannelMapping);
}

export async function findDiscordMappingByChannelId(
  db: Database,
  channelId: string,
): Promise<DiscordChannelRepoMappingRecord | null> {
  const rows = await db
    .select()
    .from(discordChannelRepoMapping)
    .where(eq(discordChannelRepoMapping.channelId, channelId))
    .limit(1);
  const row = rows[0];
  return row ? mapChannelMapping(row) : null;
}

export async function findDiscordMappingForRepo(
  db: Database,
  organizationId: string,
  owner: string,
  repo: string,
  provider?: string,
): Promise<DiscordChannelRepoMappingRecord | null> {
  const conditions = [
    eq(discordChannelRepoMapping.organizationId, organizationId),
    sql`lower(${discordChannelRepoMapping.namespace}) = ${owner.toLowerCase()}`,
    sql`lower(${discordChannelRepoMapping.repoName}) = ${repo.toLowerCase()}`,
  ];
  if (provider) conditions.push(eq(discordChannelRepoMapping.provider, provider));

  const rows = await db
    .select()
    .from(discordChannelRepoMapping)
    .where(and(...conditions))
    .limit(1);
  const row = rows[0];
  return row ? mapChannelMapping(row) : null;
}

export async function upsertDiscordChannelRepoMapping(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    installationId: string;
    guildId: string;
    channelId: string;
    channelName: string;
    provider: string;
    namespace: string;
    repoName: string;
    projectSourceControlConnectionId?: string | null;
    threadId?: string | null;
  },
): Promise<DiscordChannelRepoMappingRecord> {
  const existingByRepo = await findDiscordMappingForRepo(
    db,
    input.organizationId,
    input.namespace,
    input.repoName,
    input.provider,
  );
  const existingByChannel = await db
    .select()
    .from(discordChannelRepoMapping)
    .where(
      and(
        eq(discordChannelRepoMapping.organizationId, input.organizationId),
        eq(discordChannelRepoMapping.channelId, input.channelId),
      ),
    )
    .limit(1);

  const values = {
    installationId: input.installationId,
    guildId: input.guildId,
    channelId: input.channelId,
    channelName: input.channelName,
    provider: input.provider,
    namespace: input.namespace,
    repoName: input.repoName,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId ?? null,
    threadId: input.threadId ?? existingByRepo?.threadId ?? null,
    updatedAt: new Date(),
  };

  if (existingByChannel[0] && existingByChannel[0].id !== existingByRepo?.id) {
    await db
      .delete(discordChannelRepoMapping)
      .where(eq(discordChannelRepoMapping.id, existingByChannel[0].id));
  }

  if (existingByRepo) {
    await db
      .update(discordChannelRepoMapping)
      .set({ ...values, userId: input.userId })
      .where(eq(discordChannelRepoMapping.id, existingByRepo.id));
    const updated = await db
      .select()
      .from(discordChannelRepoMapping)
      .where(eq(discordChannelRepoMapping.id, existingByRepo.id))
      .limit(1);
    return mapChannelMapping(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(discordChannelRepoMapping).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(discordChannelRepoMapping)
    .where(eq(discordChannelRepoMapping.id, id))
    .limit(1);
  return mapChannelMapping(inserted[0]!);
}

export async function pruneDiscordInstallationsForOrg(
  db: Database,
  organizationId: string,
  keepGuildIds: string[],
): Promise<void> {
  const installations = await listDiscordInstallationsForOrg(db, organizationId);
  const keep = new Set(keepGuildIds);
  for (const installation of installations) {
    if (!keep.has(installation.guildId)) {
      await db
        .delete(discordInstallation)
        .where(eq(discordInstallation.id, installation.id));
    }
  }
}
export async function deleteDiscordChannelMapping(
  db: Database,
  organizationId: string,
  mappingId: string,
): Promise<boolean> {
  const result = await db
    .delete(discordChannelRepoMapping)
    .where(
      and(
        eq(discordChannelRepoMapping.id, mappingId),
        eq(discordChannelRepoMapping.organizationId, organizationId),
      ),
    );
  return (result as { rowCount?: number }).rowCount !== 0;
}
