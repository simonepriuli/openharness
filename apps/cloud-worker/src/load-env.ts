import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const envFiles = [
  resolve(packageRoot, ".env"),
  resolve(packageRoot, "../api/.env"),
];

export function loadCloudWorkerEnv(options?: { envFiles?: string[] }): void {
  const files = options?.envFiles ?? envFiles;
  for (const path of files) {
    if (existsSync(path)) {
      loadDotenv({ path });
    }
  }
}
