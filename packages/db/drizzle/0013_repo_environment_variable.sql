CREATE TABLE IF NOT EXISTS "repo_environment_variable" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "project_source_control_connection_id" text NOT NULL,
  "key" text NOT NULL,
  "value_encrypted" text NOT NULL,
  "is_secret" boolean DEFAULT false NOT NULL,
  "description" text,
  "updated_by_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repo_environment_variable_connection_key_idx" ON "repo_environment_variable" USING btree ("project_source_control_connection_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_environment_variable_organizationId_idx" ON "repo_environment_variable" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repo_environment_variable_connectionId_idx" ON "repo_environment_variable" USING btree ("project_source_control_connection_id");
