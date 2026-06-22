/**
 * Dedupe org repo connections and apply Phase 2 schema (repo-only connections).
 *
 * Run: pnpm --filter @openharness/db db:repo-bindings
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../src/client.js";
import { planConnectionDedupe } from "../src/connection-dedupe.js";
import {
  projectGithubConnection,
  workflow,
  workflowRun,
} from "../src/schema/index.js";

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

async function dedupeConnections(): Promise<void> {
  const databaseUrl = loadDatabaseUrl();
  const db = createDb(databaseUrl);

  const connections = await db.select().from(projectGithubConnection);
  const plans = planConnectionDedupe(connections);

  let merged = 0;
  for (const plan of plans) {
    await db
      .update(workflow)
      .set({ projectGithubConnectionId: plan.canonicalId })
      .where(inArray(workflow.projectGithubConnectionId, plan.duplicateIds));

    await db
      .update(workflowRun)
      .set({ projectGithubConnectionId: plan.canonicalId })
      .where(inArray(workflowRun.projectGithubConnectionId, plan.duplicateIds));

    await db
      .delete(projectGithubConnection)
      .where(inArray(projectGithubConnection.id, plan.duplicateIds));

    merged += plan.duplicateIds.length;
    const sample = connections.find((row) => row.id === plan.canonicalId);
    console.log(
      `[dedupe] ${sample?.githubOwner}/${sample?.githubRepo}: kept ${plan.canonicalId}, removed ${plan.duplicateIds.length}`,
    );
  }

  console.log(`[dedupe] removed ${merged} duplicate connection(s)`);
}

async function main(): Promise<void> {
  const drizzleDir = resolve(dbRoot, "drizzle");

  console.log("[repo-bindings] step 1/3: apply 0006_runner_repo_bindings.sql");
  await applySqlFile(resolve(drizzleDir, "0006_runner_repo_bindings.sql"));

  console.log("[repo-bindings] step 2/3: dedupe connections per org/repo");
  await dedupeConnections();

  console.log("[repo-bindings] step 3/3: apply 0007_repo_only_connections.sql");
  await applySqlFile(resolve(drizzleDir, "0007_repo_only_connections.sql"));

  console.log("[repo-bindings] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
