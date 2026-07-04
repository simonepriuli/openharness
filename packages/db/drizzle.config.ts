import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const packageRoot = dirname(fileURLToPath(import.meta.url));
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

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. Set it in apps/api/.env (recommended) or packages/db/.env",
  );
}

// drizzle-kit uses the `pg` driver (TCP). Neon serverless URLs sometimes include
// `channel_binding=require`, which breaks `pg` on some platforms.
const databaseUrl = rawDatabaseUrl
  .replace(/([?&])channel_binding=require(&|$)/, (_match, prefix, suffix) =>
    suffix === "&" ? prefix : prefix === "?" ? "?" : "",
  )
  .replace(/\?$/, "");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
