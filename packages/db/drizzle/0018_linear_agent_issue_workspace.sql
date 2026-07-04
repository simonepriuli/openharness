ALTER TABLE "linear_agent_run" ADD COLUMN IF NOT EXISTS "linear_issue_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_agent_run_org_issue_status_idx" ON "linear_agent_run" USING btree ("organization_id","linear_issue_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linear_agent_issue_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"linear_issue_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"bundle_fingerprint" text NOT NULL,
	"sandbox_name" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"worktree_path" text,
	"work_branch" text,
	"pi_agent_dir" text,
	"pi_session_path" text,
	"last_completed_run_id" text,
	"last_active_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_agent_issue_workspace" ADD CONSTRAINT "linear_agent_issue_workspace_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "linear_agent_issue_workspace" ADD CONSTRAINT "linear_agent_issue_workspace_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_agent_issue_workspace_org_issue_idx" ON "linear_agent_issue_workspace" USING btree ("organization_id","linear_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_agent_issue_workspace_organizationId_idx" ON "linear_agent_issue_workspace" USING btree ("organization_id");
