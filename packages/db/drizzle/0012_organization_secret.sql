CREATE TABLE IF NOT EXISTS "organization_secret" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "slot" text NOT NULL,
  "value_encrypted" text NOT NULL,
  "updated_by_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_secret" ADD CONSTRAINT "organization_secret_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_secret" ADD CONSTRAINT "organization_secret_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_secret_org_slot_idx" ON "organization_secret" USING btree ("organization_id","slot");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_secret_organizationId_idx" ON "organization_secret" USING btree ("organization_id");
