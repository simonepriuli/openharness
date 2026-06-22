DROP INDEX IF EXISTS "project_github_connection_org_project_idx";
--> statement-breakpoint
ALTER TABLE "project_github_connection" DROP COLUMN IF EXISTS "project_path";
--> statement-breakpoint
CREATE UNIQUE INDEX "project_github_connection_org_repo_idx" ON "project_github_connection" USING btree ("organization_id","installation_id","github_owner","github_repo");
