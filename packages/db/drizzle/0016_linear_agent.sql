ALTER TABLE "linear_installation" ADD COLUMN IF NOT EXISTS "granted_scopes" text;

CREATE TABLE IF NOT EXISTS "linear_agent_config" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "mapping_id" text NOT NULL REFERENCES "linear_project_repo_mapping"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "model" text NOT NULL DEFAULT '',
  "instructions" text NOT NULL DEFAULT '',
  "target_branch" text NOT NULL DEFAULT 'main',
  "tools" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "linear_agent_config_mapping_idx"
  ON "linear_agent_config" ("mapping_id");

CREATE INDEX IF NOT EXISTS "linear_agent_config_organizationId_idx"
  ON "linear_agent_config" ("organization_id");

CREATE TABLE IF NOT EXISTS "linear_agent_session" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "mapping_id" text REFERENCES "linear_project_repo_mapping"("id") ON DELETE SET NULL,
  "linear_agent_session_id" text NOT NULL,
  "linear_issue_id" text,
  "issue_identifier" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "linear_agent_session_linear_id_idx"
  ON "linear_agent_session" ("linear_agent_session_id");

CREATE INDEX IF NOT EXISTS "linear_agent_session_organizationId_idx"
  ON "linear_agent_session" ("organization_id");

CREATE TABLE IF NOT EXISTS "linear_agent_run" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL REFERENCES "linear_agent_session"("id") ON DELETE CASCADE,
  "mapping_id" text REFERENCES "linear_project_repo_mapping"("id") ON DELETE SET NULL,
  "project_source_control_connection_id" text REFERENCES "project_source_control_connection"("id") ON DELETE SET NULL,
  "connection_id" text REFERENCES "source_control_connection"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "namespace" text NOT NULL,
  "repo_name" text NOT NULL,
  "trigger" text NOT NULL,
  "delivery_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "claimed_by" text,
  "runner_kind" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "result_markdown" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "linear_agent_run_deliveryId_idx"
  ON "linear_agent_run" ("delivery_id");

CREATE INDEX IF NOT EXISTS "linear_agent_run_org_status_idx"
  ON "linear_agent_run" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "linear_agent_run_sessionId_idx"
  ON "linear_agent_run" ("session_id");
