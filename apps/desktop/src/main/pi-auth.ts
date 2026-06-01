import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensurePiAgentDir, getPiAgentDir } from "./pi-config.js";

const OPENROUTER_PROVIDER = "openrouter";

type ApiKeyCredential = {
  type: "api_key";
  key: string;
};

type AuthStorageData = Record<string, ApiKeyCredential | Record<string, unknown>>;

function authPath(): string {
  return path.join(getPiAgentDir(), "auth.json");
}

function readAuthData(): AuthStorageData {
  const file = authPath();
  if (!existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AuthStorageData;
  } catch {
    return {};
  }
}

function writeAuthData(data: AuthStorageData): void {
  ensurePiAgentDir();
  const file = authPath();
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

export type OpenRouterAuthStatus = {
  configured: boolean;
  maskedHint?: string;
};

function isApiKeyCredential(cred: unknown): cred is ApiKeyCredential {
  return (
    typeof cred === "object" &&
    cred !== null &&
    (cred as ApiKeyCredential).type === "api_key" &&
    typeof (cred as ApiKeyCredential).key === "string"
  );
}

export function getOpenRouterAuthStatus(): OpenRouterAuthStatus {
  const cred = readAuthData()[OPENROUTER_PROVIDER];
  if (isApiKeyCredential(cred) && cred.key.trim()) {
    return { configured: true, maskedHint: maskKey(cred.key) };
  }
  return { configured: false };
}

export function setOpenRouterApiKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key cannot be empty");
  }
  const data = readAuthData();
  data[OPENROUTER_PROVIDER] = { type: "api_key", key: trimmed };
  writeAuthData(data);
}

export function clearOpenRouterApiKey(): void {
  const data = readAuthData();
  delete data[OPENROUTER_PROVIDER];
  writeAuthData(data);
}
