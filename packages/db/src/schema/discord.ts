import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";
import { projectSourceControlConnection } from "./source-control.js";

export const discordInstallation = pgTable(
  "discord_installation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    guildName: text("guild_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("discord_installation_org_guild_idx").on(table.organizationId, table.guildId),
    index("discord_installation_organizationId_idx").on(table.organizationId),
    index("discord_installation_userId_idx").on(table.userId),
  ],
);

export const discordChannelRepoMapping = pgTable(
  "discord_channel_repo_mapping",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => discordInstallation.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    provider: text("provider").notNull(),
    namespace: text("namespace").notNull(),
    repoName: text("repo_name").notNull(),
    projectSourceControlConnectionId: text("project_source_control_connection_id").references(
      () => projectSourceControlConnection.id,
      { onDelete: "set null" },
    ),
    threadId: text("thread_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("discord_channel_repo_mapping_org_repo_idx").on(
      table.organizationId,
      table.provider,
      table.namespace,
      table.repoName,
    ),
    uniqueIndex("discord_channel_repo_mapping_org_channel_idx").on(
      table.organizationId,
      table.channelId,
    ),
    index("discord_channel_repo_mapping_channelId_idx").on(table.channelId),
    index("discord_channel_repo_mapping_installationId_idx").on(table.installationId),
    index("discord_channel_repo_mapping_organizationId_idx").on(table.organizationId),
  ],
);
