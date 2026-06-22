CREATE TABLE IF NOT EXISTS "teams_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL,
  "team_id" text NOT NULL,
  "team_name" text NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp,
  "service_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_installation_user_team_idx" ON "teams_installation" ("user_id", "team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_installation_userId_idx" ON "teams_installation" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams_channel_repo_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "installation_id" text NOT NULL REFERENCES "teams_installation"("id") ON DELETE CASCADE,
  "team_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "channel_name" text NOT NULL,
  "github_owner" text NOT NULL,
  "github_repo" text NOT NULL,
  "conversation_id" text,
  "service_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_channel_repo_mapping_user_repo_idx" ON "teams_channel_repo_mapping" ("user_id", "github_owner", "github_repo");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_channel_repo_mapping_user_channel_idx" ON "teams_channel_repo_mapping" ("user_id", "channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_channel_repo_mapping_channelId_idx" ON "teams_channel_repo_mapping" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_channel_repo_mapping_installationId_idx" ON "teams_channel_repo_mapping" ("installation_id");
