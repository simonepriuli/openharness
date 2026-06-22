/**
 * Apply a raw SQL migration file (statement-breakpoint separated).
 *
 * Usage: node --import tsx packages/db/scripts/apply-sql-file.ts packages/db/drizzle/0002_organizations.sql
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
for (const envPath of [
  resolve(repoRoot, "apps/api/.env"),
  resolve(packageRoot, ".env"),
  resolve(repoRoot, ".env"),
]) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const fileArg = process.argv[2];
if (!fileArg) {
  throw new Error("Usage: apply-sql-file.ts <path-to.sql>");
}

const sqlPath = resolve(fileArg);
const raw = readFileSync(sqlPath, "utf8");
const statements = raw
  .split(/--> statement-breakpoint\n?/)
  .map((chunk) => chunk.trim())
  .filter(Boolean);

const sql = neon(databaseUrl);

for (const statement of statements) {
  console.log(`[sql] ${statement.slice(0, 80).replace(/\s+/g, " ")}…`);
  await sql.query(statement, []);
}

console.log(`[sql] applied ${statements.length} statements from ${sqlPath}`);
