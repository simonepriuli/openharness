import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const envFiles = [
  resolve(packageRoot, ".env"),
  resolve(packageRoot, "../api/.env"),
];

export function loadCloudWorkerEnv(): void {
  for (const path of envFiles) {
    if (existsSync(path)) {
      loadDotenv({ path });
    }
  }
}
