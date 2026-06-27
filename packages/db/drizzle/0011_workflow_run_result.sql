ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "result_markdown" text;
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN IF NOT EXISTS "result_payload" jsonb;
