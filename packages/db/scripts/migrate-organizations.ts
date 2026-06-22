/**
 * Full org migration: SQL 0002 → backfill → SQL 0003.
 *
 * Usage: pnpm --filter @openharness/db db:orgs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { createDb } from "../src/client.js";
import {
  githubInstallation,
  member,
  organization,
  projectGithubConnection,
  teamsChannelRepoMapping,
  teamsInstallation,
  user,
  workflow,
  workflowRun,
  workflowSetting,
} from "../src/schema/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(scriptDir, "..");
const repoRoot = resolve(dbRoot, "../..");

for (const envPath of [
  resolve(repoRoot, "apps/api/.env"),
  resolve(dbRoot, ".env"),
  resolve(repoRoot, ".env"),
]) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (set it in apps/api/.env)");
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "org";
}

function defaultOrgName(userName: string): string {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s Organization` : "My Organization";
}

function defaultOrgSlug(userEmail: string, userId: string): string {
  const local = userEmail.split("@")[0] ?? "user";
  return `${slugify(local)}-${userId.slice(0, 8)}`;
}

async function applySqlFile(sqlPath: string): Promise<void> {
  const raw = readFileSync(sqlPath, "utf8");
  const statements = raw
    .split(/--> statement-breakpoint\n?/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const sql = neon(databaseUrl!);
  for (const statement of statements) {
    console.log(`[sql] ${statement.slice(0, 80).replace(/\s+/g, " ")}…`);
    await sql.query(statement, []);
  }
  console.log(`[sql] applied ${statements.length} statements from ${sqlPath}`);
}

async function getMembershipForUser(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<{ organizationId: string } | null> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[bytes[i]! % alphabet.length];
  }
  return code;
}

async function createPersonalOrganizationForUser(
  db: ReturnType<typeof createDb>,
  input: { userId: string; name: string; email: string },
): Promise<string> {
  const orgId = randomUUID();
  const memberId = randomUUID();
  const orgName = defaultOrgName(input.name);
  const orgSlug = defaultOrgSlug(input.email, input.userId);
  const inviteCode = generateInviteCode();

  await db.insert(organization).values({
    id: orgId,
    name: orgName,
    slug: orgSlug,
    inviteCode,
  });

  await db.insert(member).values({
    id: memberId,
    organizationId: orgId,
    userId: input.userId,
    role: "owner",
  });

  return orgId;
}

async function ensureOrgForUser(
  db: ReturnType<typeof createDb>,
  row: { id: string; name: string; email: string },
): Promise<string> {
  const existing = await getMembershipForUser(db, row.id);
  if (existing) return existing.organizationId;

  return createPersonalOrganizationForUser(db, {
    userId: row.id,
    name: row.name,
    email: row.email,
  });
}

async function backfillTableOrganizationId(
  db: ReturnType<typeof createDb>,
  tableName: string,
  userIdToOrgId: Map<string, string>,
): Promise<number> {
  const tables = {
    github_installation: githubInstallation,
    project_github_connection: projectGithubConnection,
    workflow,
    workflow_run: workflowRun,
    workflow_setting: workflowSetting,
    teams_installation: teamsInstallation,
    teams_channel_repo_mapping: teamsChannelRepoMapping,
  } as const;

  type TableKey = keyof typeof tables;
  const table = tables[tableName as TableKey];
  if (!table) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  const rows = await db
    .select({
      id: table.id,
      userId: table.userId,
      organizationId: table.organizationId,
    })
    .from(table);

  let updated = 0;
  for (const row of rows) {
    if (row.organizationId) continue;
    const orgId = userIdToOrgId.get(row.userId);
    if (!orgId) {
      console.warn(`[migrate] skip ${tableName} row ${row.id}: no org for user ${row.userId}`);
      continue;
    }
    await db.update(table).set({ organizationId: orgId }).where(eq(table.id, row.id));
    updated += 1;
  }
  return updated;
}

async function backfillOrganizationData(db: ReturnType<typeof createDb>): Promise<void> {
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user);

  const userIdToOrgId = new Map<string, string>();
  for (const row of users) {
    const orgId = await ensureOrgForUser(db, row);
    userIdToOrgId.set(row.id, orgId);
  }

  console.log(`[migrate] ensured organizations for ${users.length} users`);

  const tableNames = [
    "github_installation",
    "project_github_connection",
    "workflow",
    "workflow_run",
    "workflow_setting",
    "teams_installation",
    "teams_channel_repo_mapping",
  ] as const;

  for (const tableName of tableNames) {
    const count = await backfillTableOrganizationId(db, tableName, userIdToOrgId);
    console.log(`[migrate] backfilled ${count} rows in ${tableName}`);
  }

  const orgs = await db.select().from(organization);
  const seenSlugs = new Set<string>();
  for (const org of orgs) {
    if (!seenSlugs.has(org.slug)) {
      seenSlugs.add(org.slug);
      continue;
    }
    const newSlug = `${org.slug}-${randomUUID().slice(0, 6)}`;
    await db.update(organization).set({ slug: newSlug }).where(eq(organization.id, org.id));
    console.log(`[migrate] renamed duplicate slug ${org.slug} -> ${newSlug}`);
  }
}

async function main(): Promise<void> {
  const drizzleDir = resolve(dbRoot, "drizzle");

  console.log("[migrate] step 1/3: apply 0002_organizations.sql (nullable organization_id)");
  await applySqlFile(resolve(drizzleDir, "0002_organizations.sql"));

  console.log("[migrate] step 2/3: backfill organization data");
  const db = createDb(databaseUrl);
  await backfillOrganizationData(db);

  console.log("[migrate] step 3/3: apply 0003_organizations_not_null.sql");
  await applySqlFile(resolve(drizzleDir, "0003_organizations_not_null.sql"));

  console.log("[migrate] done — db:push should be a no-op");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
