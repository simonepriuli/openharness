import { app } from "electron";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getOpenRouterApiKey } from "./pi-auth.js";

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const FETCH_TIMEOUT_MS = 10_000;
const CREDITS_CACHE_MS = 60_000;

export type OpenRouterAccountCreditsResult =
  | { status: "not_configured" }
  | { status: "invalid_key" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      totalCredits: number;
      totalUsage: number;
      creditsRemaining: number;
      /** This-month spend for the configured inference key, if available. */
      monthlySpent?: number;
    };

let creditsCache: {
  fetchedAt: number;
  result: OpenRouterAccountCreditsResult;
} | null = null;

type ManagementStorageData = {
  managementKey?: string;
};

function managementPath(): string {
  return path.join(app.getPath("userData"), "openrouter-management.json");
}

function readManagementData(): ManagementStorageData {
  const file = managementPath();
  if (!existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ManagementStorageData;
  } catch {
    return {};
  }
}

function writeManagementData(data: ManagementStorageData): void {
  const file = managementPath();
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

function getManagementKey(): string | null {
  const key = readManagementData().managementKey?.trim();
  return key || null;
}

export type OpenRouterManagementStatus = {
  configured: boolean;
  maskedHint?: string;
};

export function getOpenRouterManagementStatus(): OpenRouterManagementStatus {
  const key = getManagementKey();
  if (key) {
    return { configured: true, maskedHint: maskKey(key) };
  }
  return { configured: false };
}

export function invalidateOpenRouterCreditsCache(): void {
  creditsCache = null;
}

export function setOpenRouterManagementKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("Management key cannot be empty");
  }
  writeManagementData({ managementKey: trimmed });
  invalidateOpenRouterCreditsCache();
}

export function clearOpenRouterManagementKey(): void {
  writeManagementData({});
  invalidateOpenRouterCreditsCache();
}

type CreditsApiResponse = {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
};

type KeyApiResponse = {
  data?: {
    usage_monthly?: number;
  };
};

/**
 * Best-effort monthly spend for the configured inference key.
 * Returns undefined if no inference key is set or the request fails.
 */
async function fetchInferenceKeyMonthlySpent(): Promise<number | undefined> {
  const inferenceKey = getOpenRouterApiKey();
  if (!inferenceKey) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(KEY_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${inferenceKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as KeyApiResponse;
    const monthly = body.data?.usage_monthly;
    return typeof monthly === "number" ? monthly : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCachedOpenRouterAccountCredits(): Promise<OpenRouterAccountCreditsResult> {
  if (creditsCache && Date.now() - creditsCache.fetchedAt < CREDITS_CACHE_MS) {
    return creditsCache.result;
  }
  const result = await fetchOpenRouterAccountCredits();
  creditsCache = { fetchedAt: Date.now(), result };
  return result;
}

async function fetchOpenRouterAccountCredits(): Promise<OpenRouterAccountCreditsResult> {
  const key = getManagementKey();
  if (!key) {
    return { status: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(CREDITS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { status: "invalid_key" };
    }

    if (!response.ok) {
      return {
        status: "error",
        message: `OpenRouter returned ${response.status}`,
      };
    }

    const body = (await response.json()) as CreditsApiResponse;
    const totalCredits = body.data?.total_credits;
    const totalUsage = body.data?.total_usage;

    if (typeof totalCredits !== "number" || typeof totalUsage !== "number") {
      return { status: "error", message: "Unexpected response from OpenRouter" };
    }

    const monthlySpent = await fetchInferenceKeyMonthlySpent();

    return {
      status: "ok",
      totalCredits,
      totalUsage,
      creditsRemaining: totalCredits - totalUsage,
      monthlySpent,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", message: "Request timed out" };
    }
    const message = err instanceof Error ? err.message : "Failed to fetch credits";
    return { status: "error", message };
  } finally {
    clearTimeout(timeout);
  }
}
