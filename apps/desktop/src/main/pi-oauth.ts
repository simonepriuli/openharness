import { loginOpenAICodexDeviceCode, type OAuthCredentials } from "@earendil-works/pi-ai/oauth";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { filterProviderModelRefs } from "../shared/oauth-model-refs.js";
import { ensurePiAgentDir, getPiAgentDir, syncDefaultModelToPiSettings } from "./pi-config.js";
import { appStore } from "./store.js";

export const CURATED_OAUTH_PROVIDERS = ["openai-codex"] as const;

export type CuratedOAuthProvider = (typeof CURATED_OAUTH_PROVIDERS)[number];

const OAUTH_PROVIDER_DISPLAY_NAMES: Record<CuratedOAuthProvider, string> = {
  "openai-codex": "ChatGPT Plus/Pro (Codex)",
};

type OAuthCredential = {
  type: "oauth";
} & OAuthCredentials;

type AuthStorageData = Record<string, OAuthCredential | Record<string, unknown>>;

export type OAuthProviderInfo = {
  id: CuratedOAuthProvider;
  displayName: string;
  configured: boolean;
  accountHint?: string;
};

export type OAuthDeviceCodeEvent = {
  providerId: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds?: number;
};

export type OAuthLoginEventSink = {
  onDeviceCode: (event: OAuthDeviceCodeEvent) => void;
  onProgress?: (message: string) => void;
  onComplete: (providerId: string) => void;
  onFailed: (message: string) => void;
};

let activeLoginAbort: AbortController | null = null;

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

function isOAuthCredential(cred: unknown): cred is OAuthCredential {
  return (
    typeof cred === "object" &&
    cred !== null &&
    (cred as OAuthCredential).type === "oauth" &&
    typeof (cred as OAuthCredential).access === "string" &&
    typeof (cred as OAuthCredential).refresh === "string" &&
    typeof (cred as OAuthCredential).expires === "number"
  );
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function accountHintFromOAuthCredential(cred: OAuthCredential): string | undefined {
  try {
    const parts = cred.access.split(".");
    if (parts.length < 2) {
      return "Connected";
    }
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    const auth = payload["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: string }
      | undefined;
    const accountId = auth?.chatgpt_account_id?.trim();
    if (!accountId) {
      return "Connected";
    }
    if (accountId.length <= 8) {
      return `Account ${accountId}`;
    }
    return `Account …${accountId.slice(-4)}`;
  } catch {
    return "Connected";
  }
}

export function isCuratedOAuthProvider(providerId: string): providerId is CuratedOAuthProvider {
  return (CURATED_OAUTH_PROVIDERS as readonly string[]).includes(providerId);
}

export function removeOAuthProviderFromChatVisibleModels(providerId: string): void {
  const current: string[] = appStore.get("chatVisibleModels") ?? [];
  const next = filterProviderModelRefs(providerId, current);
  if (next.length === current.length) {
    return;
  }
  if (next.length === 0) {
    appStore.delete("chatVisibleModels");
  } else {
    appStore.set("chatVisibleModels", next);
  }
  syncDefaultModelToPiSettings();
}

export function getOAuthProviderStatus(providerId: string): {
  configured: boolean;
  accountHint?: string;
} {
  if (!isCuratedOAuthProvider(providerId)) {
    return { configured: false };
  }
  const cred = readAuthData()[providerId];
  if (!isOAuthCredential(cred)) {
    return { configured: false };
  }
  return {
    configured: true,
    accountHint: accountHintFromOAuthCredential(cred),
  };
}

export function getOAuthProviders(): OAuthProviderInfo[] {
  return CURATED_OAUTH_PROVIDERS.map((id) => {
    const status = getOAuthProviderStatus(id);
    return {
      id,
      displayName: OAUTH_PROVIDER_DISPLAY_NAMES[id],
      configured: status.configured,
      ...(status.accountHint ? { accountHint: status.accountHint } : {}),
    };
  });
}

export function hasAnyOAuthProviderConfigured(): boolean {
  return CURATED_OAUTH_PROVIDERS.some((providerId) => getOAuthProviderStatus(providerId).configured);
}

export function persistOAuthCredentials(
  providerId: string,
  credentials: OAuthCredentials,
): void {
  if (!isCuratedOAuthProvider(providerId)) {
    throw new Error(`Unsupported OAuth provider: ${providerId}`);
  }
  const data = readAuthData();
  data[providerId] = { type: "oauth", ...credentials };
  writeAuthData(data);
}

export function clearOAuthProvider(providerId: string): void {
  if (!isCuratedOAuthProvider(providerId)) {
    throw new Error(`Unsupported OAuth provider: ${providerId}`);
  }
  const data = readAuthData();
  delete data[providerId];
  writeAuthData(data);
  removeOAuthProviderFromChatVisibleModels(providerId);
}

export function isOAuthLoginInProgress(): boolean {
  return activeLoginAbort !== null;
}

export function cancelOAuthLogin(): void {
  activeLoginAbort?.abort();
  activeLoginAbort = null;
}

export async function runOAuthLogin(
  providerId: string,
  sink: OAuthLoginEventSink,
): Promise<void> {
  if (!isCuratedOAuthProvider(providerId)) {
    sink.onFailed(`Unsupported OAuth provider: ${providerId}`);
    return;
  }
  if (activeLoginAbort) {
    sink.onFailed("An OAuth login is already in progress.");
    return;
  }

  const abort = new AbortController();
  activeLoginAbort = abort;

  try {
    sink.onProgress?.("Starting ChatGPT authorization…");

    let credentials: OAuthCredentials;
    if (providerId === "openai-codex") {
      credentials = await loginOpenAICodexDeviceCode({
        onDeviceCode: (info) => {
          sink.onDeviceCode({
            providerId,
            userCode: info.userCode,
            verificationUri: info.verificationUri,
            expiresInSeconds: info.expiresInSeconds,
          });
          sink.onProgress?.("Waiting for authorization…");
        },
        signal: abort.signal,
      });
    } else {
      throw new Error(`Unsupported OAuth provider: ${providerId}`);
    }

    persistOAuthCredentials(providerId, credentials);
    sink.onComplete(providerId);
  } catch (err) {
    if (abort.signal.aborted) {
      sink.onFailed("Authorization canceled.");
      return;
    }
    const message = err instanceof Error ? err.message : "OAuth login failed";
    sink.onFailed(message);
  } finally {
    if (activeLoginAbort === abort) {
      activeLoginAbort = null;
    }
  }
}
