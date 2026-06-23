/**
 * Migrate GitHub tables to unified source control schema.
 *
 * Run: pnpm --filter @openharness/db db:source-control
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

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
  const migrationPath = resolve(dbRoot, "drizzle/0009_source_control_unified.sql");
  console.log("[migrate] Applying source control unified migration…");
  await applySqlFile(migrationPath);
  console.log("[migrate] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
