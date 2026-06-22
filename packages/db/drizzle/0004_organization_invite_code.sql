-- Add invite_code column (nullable until backfill)

ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "invite_code" text;
