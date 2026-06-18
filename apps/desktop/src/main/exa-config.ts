import { app } from "electron";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXA_ENV_VAR = "EXA_API_KEY";

type ExaStorageData = {
  apiKey?: string;
};

function exaConfigPath(): string {
  return path.join(app.getPath("userData"), "exa.json");
}

function readExaData(): ExaStorageData {
  const file = exaConfigPath();
  if (!existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ExaStorageData;
  } catch {
    return {};
  }
}

function writeExaData(data: ExaStorageData): void {
  const file = exaConfigPath();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) {
    return "••••";
  }
  return `••••••••${trimmed.slice(-4)}`;
}

function getStoredExaApiKey(): string | null {
  const key = readExaData().apiKey?.trim();
  return key || null;
}

export type ExaAuthSource = "stored" | "environment";

export type ExaStatus = {
  configured: boolean;
  maskedHint?: string;
  source?: ExaAuthSource;
  envVar?: string;
};

export function getExaApiKey(): string | null {
  const stored = getStoredExaApiKey();
  if (stored) {
    return stored;
  }
  const fromEnv = process.env[EXA_ENV_VAR]?.trim();
  return fromEnv || null;
}

export function getExaStatus(): ExaStatus {
  const stored = getStoredExaApiKey();
  if (stored) {
    return { configured: true, maskedHint: maskKey(stored), source: "stored" };
  }
  const fromEnv = process.env[EXA_ENV_VAR]?.trim();
  if (fromEnv) {
    return {
      configured: true,
      maskedHint: maskKey(fromEnv),
      source: "environment",
      envVar: EXA_ENV_VAR,
    };
  }
  return { configured: false };
}

export function setExaApiKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("Exa API key cannot be empty");
  }
  writeExaData({ apiKey: trimmed });
}

export function clearExaApiKey(): void {
  writeExaData({});
}
