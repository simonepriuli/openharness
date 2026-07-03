CREATE TABLE IF NOT EXISTS "linear_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL,
  "workspace_name" text NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp,
  "webhook_id" text,
  "webhook_secret_encrypted" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_installation_org_workspace_idx"
  ON "linear_installation" ("organization_id", "workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_installation_organizationId_idx"
  ON "linear_installation" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_installation_userId_idx"
  ON "linear_installation" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_installation_webhookId_idx"
  ON "linear_installation" ("webhook_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "linear_project_repo_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "installation_id" text NOT NULL REFERENCES "linear_installation"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "project_name" text NOT NULL,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "repo_name" text NOT NULL,
  "project_source_control_connection_id" text REFERENCES "project_source_control_connection"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_project_repo_mapping_org_repo_idx"
  ON "linear_project_repo_mapping" ("organization_id", "provider", "namespace", "repo_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_project_repo_mapping_org_project_idx"
  ON "linear_project_repo_mapping" ("organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_project_repo_mapping_projectId_idx"
  ON "linear_project_repo_mapping" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_project_repo_mapping_installationId_idx"
  ON "linear_project_repo_mapping" ("installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_project_repo_mapping_organizationId_idx"
  ON "linear_project_repo_mapping" ("organization_id");
