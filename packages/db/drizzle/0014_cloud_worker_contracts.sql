ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "cloud_workers_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN IF NOT EXISTS "execution_target" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "resolved_executor" text DEFAULT 'local' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "runner_kind" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_run_event" ADD CONSTRAINT "workflow_run_event_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_run_event" ADD CONSTRAINT "workflow_run_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_run_event_run_seq_idx" ON "workflow_run_event" USING btree ("workflow_run_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_event_organizationId_idx" ON "workflow_run_event" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_org_status_executor_idx" ON "workflow_run" USING btree ("organization_id","status","resolved_executor");
