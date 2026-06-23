-- Unified source control schema migration
CREATE TABLE IF NOT EXISTS "source_control_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "external_org_id" text NOT NULL,
  "display_name" text NOT NULL,
  "credentials_encrypted" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_control_connection_provider_org_external_idx" ON "source_control_connection" ("provider", "organization_id", "external_org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_control_connection_organizationId_idx" ON "source_control_connection" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_control_connection_userId_idx" ON "source_control_connection" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_control_connection_provider_idx" ON "source_control_connection" ("provider");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_control_repo" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "source_control_connection"("id") ON DELETE CASCADE,
  "external_repo_id" text NOT NULL,
  "namespace" text NOT NULL,
  "name" text NOT NULL,
  "full_name" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_control_repo_connection_external_idx" ON "source_control_repo" ("connection_id", "external_repo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_control_repo_connectionId_idx" ON "source_control_repo" ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_control_repo_namespace_name_idx" ON "source_control_repo" ("namespace", "name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_source_control_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "connection_id" text NOT NULL REFERENCES "source_control_connection"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "name" text NOT NULL,
  "external_repo_id" text NOT NULL,
  "remote_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_source_control_connection_org_repo_idx" ON "project_source_control_connection" ("organization_id", "connection_id", "namespace", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_control_connection_organizationId_idx" ON "project_source_control_connection" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_control_connection_userId_idx" ON "project_source_control_connection" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_control_connection_connectionId_idx" ON "project_source_control_connection" ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_source_control_connection_repo_idx" ON "project_source_control_connection" ("provider", "namespace", "name");
--> statement-breakpoint
INSERT INTO "source_control_connection" ("id", "provider", "organization_id", "user_id", "external_org_id", "display_name", "metadata", "created_at", "updated_at")
SELECT
  gi."id",
  'github',
  gi."organization_id",
  gi."user_id",
  gi."installation_id",
  gi."account_login",
  jsonb_build_object(
    'accountType', gi."account_type",
    'repositorySelection', gi."repository_selection",
    'installationId', gi."installation_id"
  ),
  gi."created_at",
  gi."updated_at"
FROM "github_installation" gi
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "source_control_repo" ("id", "connection_id", "external_repo_id", "namespace", "name", "full_name", "created_at", "updated_at")
SELECT
  gir."id",
  sc."id",
  gir."github_repo_id",
  gir."owner",
  gir."name",
  gir."full_name",
  gir."created_at",
  gir."updated_at"
FROM "github_installation_repo" gir
JOIN "source_control_connection" sc
  ON sc."provider" = 'github' AND sc."external_org_id" = gir."installation_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "project_source_control_connection" ("id", "organization_id", "user_id", "connection_id", "provider", "namespace", "name", "external_repo_id", "remote_url", "metadata", "created_at", "updated_at")
SELECT
  pgc."id",
  pgc."organization_id",
  pgc."user_id",
  sc."id",
  'github',
  pgc."github_owner",
  pgc."github_repo",
  pgc."github_repo_id",
  pgc."remote_url",
  jsonb_build_object('installationId', pgc."installation_id"),
  pgc."created_at",
  pgc."updated_at"
FROM "project_github_connection" pgc
JOIN "source_control_connection" sc
  ON sc."provider" = 'github' AND sc."external_org_id" = pgc."installation_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD COLUMN IF NOT EXISTS "project_source_control_connection_id" text;
--> statement-breakpoint
UPDATE "runner_repo_binding" rrb
SET "project_source_control_connection_id" = rrb."project_github_connection_id"
WHERE rrb."project_source_control_connection_id" IS NULL
  AND rrb."project_github_connection_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN IF NOT EXISTS "project_source_control_connection_id" text;
--> statement-breakpoint
UPDATE "workflow" w
SET "project_source_control_connection_id" = w."project_github_connection_id"
WHERE w."project_source_control_connection_id" IS NULL
  AND w."project_github_connection_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow_setting" ADD COLUMN IF NOT EXISTS "project_source_control_connection_id" text;
--> statement-breakpoint
UPDATE "workflow_setting" ws
SET "project_source_control_connection_id" = ws."project_github_connection_id"
WHERE ws."project_source_control_connection_id" IS NULL
  AND ws."project_github_connection_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "project_source_control_connection_id" text;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "connection_id" text;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "namespace" text;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "repo_name" text;
--> statement-breakpoint
UPDATE "workflow_run" wr
SET
  "project_source_control_connection_id" = wr."project_github_connection_id",
  "connection_id" = sc."id",
  "provider" = 'github',
  "namespace" = wr."github_owner",
  "repo_name" = wr."github_repo"
FROM "source_control_connection" sc
WHERE wr."project_source_control_connection_id" IS NULL
  AND wr."project_github_connection_id" IS NOT NULL
  AND sc."provider" = 'github'
  AND sc."external_org_id" = wr."installation_id";
--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD COLUMN IF NOT EXISTS "namespace" text;
--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD COLUMN IF NOT EXISTS "repo_name" text;
--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD COLUMN IF NOT EXISTS "project_source_control_connection_id" text;
--> statement-breakpoint
UPDATE "teams_channel_repo_mapping" tcrm
SET
  "provider" = 'github',
  "namespace" = tcrm."github_owner",
  "repo_name" = tcrm."github_repo",
  "project_source_control_connection_id" = psc."id"
FROM "project_source_control_connection" psc
WHERE tcrm."provider" IS NULL
  AND psc."provider" = 'github'
  AND lower(psc."namespace") = lower(tcrm."github_owner")
  AND lower(psc."name") = lower(tcrm."github_repo")
  AND psc."organization_id" = tcrm."organization_id";
