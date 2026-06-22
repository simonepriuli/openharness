/**
 * Backfill organization.invite_code for existing rows, then apply 0005.
 *
 * Run: pnpm --filter @openharness/db db:invite-codes
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { createDb } from "../src/client.js";
import { organization } from "../src/schema/index.js";

const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(scriptDir, "..");

function loadDatabaseUrl(): string {
  const envPath = resolve(dbRoot, "../../apps/api/.env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key === "DATABASE_URL") return value;
    }
  }
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  throw new Error("DATABASE_URL is required (set in apps/api/.env or environment)");
}

function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[bytes[i]! % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

async function applySqlFile(path: string): Promise<void> {
  const databaseUrl = loadDatabaseUrl();
  const sql = neon(databaseUrl);
  const content = readFileSync(path, "utf8");
  const statements = content
    .split(/-->\s*statement-breakpoint/g)
    .map((part) => part.replace(/^--[^\n]*\n/gm, "").trim())
    .filter(Boolean);

  for (const statement of statements) {
    console.log(`[sql] ${statement.slice(0, 80).replace(/\s+/g, " ")}…`);
    await sql.query(statement, []);
  }
}

async function main(): Promise<void> {
  const databaseUrl = loadDatabaseUrl();
  const drizzleDir = resolve(dbRoot, "drizzle");

  console.log("[invite-codes] step 1/3: apply 0004_organization_invite_code.sql");
  await applySqlFile(resolve(drizzleDir, "0004_organization_invite_code.sql"));

  const db = createDb(databaseUrl);
  const orgs = await db
    .select({ id: organization.id, inviteCode: organization.inviteCode })
    .from(organization);

  const usedCodes = new Set(
    orgs.map((row) => row.inviteCode).filter((code): code is string => Boolean(code)),
  );

  let updated = 0;
  for (const org of orgs) {
    if (org.inviteCode) continue;
    let code = generateInviteCode();
    while (usedCodes.has(code)) {
      code = generateInviteCode();
    }
    usedCodes.add(code);
    await db.update(organization).set({ inviteCode: code }).where(eq(organization.id, org.id));
    updated += 1;
  }

  console.log(`[invite-codes] step 2/3: backfilled ${updated} organizations`);

  console.log("[invite-codes] step 3/3: apply 0005_organization_invite_code_not_null.sql");
  await applySqlFile(resolve(drizzleDir, "0005_organization_invite_code_not_null.sql"));

  console.log("[invite-codes] done");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
