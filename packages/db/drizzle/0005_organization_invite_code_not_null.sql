-- Run ONLY after backfill-invite-codes.ts has filled invite_code on every organization

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invite_code_unique" ON "organization" ("invite_code");
--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "invite_code" SET NOT NULL;
