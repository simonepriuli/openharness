CREATE TABLE "runner_repo_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"runner_instance_id" text NOT NULL,
	"project_github_connection_id" text NOT NULL,
	"project_path" text NOT NULL,
	"label" text,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_project_github_connection_id_project_github_connection_id_fk" FOREIGN KEY ("project_github_connection_id") REFERENCES "public"."project_github_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "runner_repo_binding_runner_connection_idx" ON "runner_repo_binding" USING btree ("runner_instance_id","project_github_connection_id");
--> statement-breakpoint
CREATE INDEX "runner_repo_binding_organizationId_idx" ON "runner_repo_binding" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "runner_repo_binding_userId_idx" ON "runner_repo_binding" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "runner_repo_binding_connectionId_idx" ON "runner_repo_binding" USING btree ("project_github_connection_id");
--> statement-breakpoint
CREATE INDEX "runner_repo_binding_runnerInstanceId_idx" ON "runner_repo_binding" USING btree ("runner_instance_id");
--> statement-breakpoint
ALTER TABLE "workflow_run" ALTER COLUMN "project_path" DROP NOT NULL;
