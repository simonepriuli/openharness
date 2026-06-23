CREATE TABLE IF NOT EXISTS "discord_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "guild_id" text NOT NULL,
  "guild_name" text NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discord_installation_org_guild_idx"
  ON "discord_installation" ("organization_id", "guild_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_installation_organizationId_idx"
  ON "discord_installation" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_installation_userId_idx"
  ON "discord_installation" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discord_channel_repo_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "installation_id" text NOT NULL REFERENCES "discord_installation"("id") ON DELETE CASCADE,
  "guild_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "channel_name" text NOT NULL,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "repo_name" text NOT NULL,
  "project_source_control_connection_id" text REFERENCES "project_source_control_connection"("id") ON DELETE SET NULL,
  "thread_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discord_channel_repo_mapping_org_repo_idx"
  ON "discord_channel_repo_mapping" ("organization_id", "provider", "namespace", "repo_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discord_channel_repo_mapping_org_channel_idx"
  ON "discord_channel_repo_mapping" ("organization_id", "channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_channel_repo_mapping_channelId_idx"
  ON "discord_channel_repo_mapping" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_channel_repo_mapping_installationId_idx"
  ON "discord_channel_repo_mapping" ("installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_channel_repo_mapping_organizationId_idx"
  ON "discord_channel_repo_mapping" ("organization_id");
