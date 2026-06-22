import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const teamsInstallation = pgTable(
  "teams_installation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at"),
    serviceUrl: text("service_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("teams_installation_user_team_idx").on(table.userId, table.teamId),
    index("teams_installation_userId_idx").on(table.userId),
  ],
);

export const teamsChannelRepoMapping = pgTable(
  "teams_channel_repo_mapping",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => teamsInstallation.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    githubOwner: text("github_owner").notNull(),
    githubRepo: text("github_repo").notNull(),
    conversationId: text("conversation_id"),
    serviceUrl: text("service_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("teams_channel_repo_mapping_user_repo_idx").on(
      table.userId,
      table.githubOwner,
      table.githubRepo,
    ),
    uniqueIndex("teams_channel_repo_mapping_user_channel_idx").on(
      table.userId,
      table.channelId,
    ),
    index("teams_channel_repo_mapping_channelId_idx").on(table.channelId),
    index("teams_channel_repo_mapping_installationId_idx").on(table.installationId),
  ],
);
