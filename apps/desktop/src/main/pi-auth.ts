import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensurePiAgentDir, getPiAgentDir } from "./pi-config.js";

export const CURATED_CLOUD_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "groq",
  "mistral",
  "deepseek",
] as const;

export type CuratedCloudProvider = (typeof CURATED_CLOUD_PROVIDERS)[number];

const PROVIDER_DISPLAY_NAMES: Record<CuratedCloudProvider, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
};

const PROVIDER_ENV_VARS: Record<CuratedCloudProvider, readonly string[]> = {
  openrouter: ["OPENROUTER_API_KEY"],
  anthropic: ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
};

type ApiKeyCredential = {
  type: "api_key";
  key: string;
};

type AuthStorageData = Record<string, ApiKeyCredential | Record<string, unknown>>;

export type ProviderAuthSource = "stored" | "environment";

export type ProviderAuthStatus = {
  configured: boolean;
  maskedHint?: string;
  source?: ProviderAuthSource;
  envVar?: string;
};

export type CloudProviderInfo = {
  id: CuratedCloudProvider;
  displayName: string;
  envVars: readonly string[];
  configured: boolean;
  maskedHint?: string;
  source?: ProviderAuthSource;
  envVar?: string;
};

export type OpenRouterAuthStatus = ProviderAuthStatus;

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

function isApiKeyCredential(cred: unknown): cred is ApiKeyCredential {
  return (
    typeof cred === "object" &&
    cred !== null &&
    (cred as ApiKeyCredential).type === "api_key" &&
    typeof (cred as ApiKeyCredential).key === "string"
  );
}

function envVarConfigured(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value);
}

function getEnvAuthStatus(provider: CuratedCloudProvider): ProviderAuthStatus {
  const envVars = PROVIDER_ENV_VARS[provider];
  for (const envVar of envVars) {
    if (envVarConfigured(envVar)) {
      return { configured: true, source: "environment", envVar };
    }
  }
  return { configured: false };
}

export function getProviderAuthStatus(provider: string): ProviderAuthStatus {
  if (!isCuratedCloudProvider(provider)) {
    return { configured: false };
  }

  const cred = readAuthData()[provider];
  if (isApiKeyCredential(cred) && cred.key.trim()) {
    return { configured: true, maskedHint: maskKey(cred.key), source: "stored" };
  }

  return getEnvAuthStatus(provider);
}

export function getProviderApiKey(provider: string): string | null {
  if (!isCuratedCloudProvider(provider)) {
    return null;
  }

  const cred = readAuthData()[provider];
  if (isApiKeyCredential(cred) && cred.key.trim()) {
    return cred.key.trim();
  }

  const envVars = PROVIDER_ENV_VARS[provider];
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }

  return null;
}

export function setProviderApiKey(provider: string, apiKey: string): void {
  if (!isCuratedCloudProvider(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key cannot be empty");
  }
  const data = readAuthData();
  data[provider] = { type: "api_key", key: trimmed };
  writeAuthData(data);
}

export function clearProviderApiKey(provider: string): void {
  if (!isCuratedCloudProvider(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const data = readAuthData();
  delete data[provider];
  writeAuthData(data);
}

export function getCloudProviders(): CloudProviderInfo[] {
  return CURATED_CLOUD_PROVIDERS.map((id) => {
    const status = getProviderAuthStatus(id);
    return {
      id,
      displayName: PROVIDER_DISPLAY_NAMES[id],
      envVars: PROVIDER_ENV_VARS[id],
      configured: status.configured,
      ...(status.maskedHint ? { maskedHint: status.maskedHint } : {}),
      ...(status.source ? { source: status.source } : {}),
      ...(status.envVar ? { envVar: status.envVar } : {}),
    };
  });
}

export function getConfiguredCloudProviders(): CuratedCloudProvider[] {
  return CURATED_CLOUD_PROVIDERS.filter((provider) => getProviderAuthStatus(provider).configured);
}

export function hasAnyCuratedCloudProviderConfigured(): boolean {
  return getConfiguredCloudProviders().length > 0;
}

export function isCuratedCloudProvider(provider: string): provider is CuratedCloudProvider {
  return (CURATED_CLOUD_PROVIDERS as readonly string[]).includes(provider);
}

export function getOpenRouterAuthStatus(): OpenRouterAuthStatus {
  return getProviderAuthStatus("openrouter");
}

export function getOpenRouterApiKey(): string | null {
  return getProviderApiKey("openrouter");
}

export function setOpenRouterApiKey(apiKey: string): void {
  setProviderApiKey("openrouter", apiKey);
}

export function clearOpenRouterApiKey(): void {
  clearProviderApiKey("openrouter");
}
