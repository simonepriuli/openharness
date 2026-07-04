CREATE TABLE IF NOT EXISTS "linear_agent_run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"linear_agent_run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_agent_run_event" ADD CONSTRAINT "linear_agent_run_event_linear_agent_run_id_linear_agent_run_id_fk" FOREIGN KEY ("linear_agent_run_id") REFERENCES "public"."linear_agent_run"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "linear_agent_run_event" ADD CONSTRAINT "linear_agent_run_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linear_agent_run_event_run_seq_idx" ON "linear_agent_run_event" USING btree ("linear_agent_run_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linear_agent_run_event_organizationId_idx" ON "linear_agent_run_event" USING btree ("organization_id");
