import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensurePiAgentDir, getPiAgentDir } from "./pi-config.js";

export type LocalProviderPreset = "lmstudio" | "ollama" | "apicursor" | "custom";

export type LocalModelEntry = {
  id: string;
  name?: string;
  enabled: boolean;
};

export type LocalProviderConfig = {
  preset: LocalProviderPreset;
  enabled: boolean;
  baseUrl: string;
  providerId?: string;
  /** LM Studio / server API token when the local server requires auth. */
  serverApiKey?: string;
  models: LocalModelEntry[];
};

export type LocalProvidersState = {
  providers: LocalProviderConfig[];
  modelsJsonPath: string;
  parseError?: string;
};

export type DiscoveredLocalModel = {
  id: string;
  name?: string;
};

export type DiscoverLocalModelsResult =
  | { ok: true; models: DiscoveredLocalModel[] }
  | { ok: false; error: string };

export type TestLocalConnectionResult =
  | { ok: true; modelCount: number }
  | { ok: false; error: string };

type ProviderCompat = {
  supportsDeveloperRole: boolean;
  supportsReasoningEffort: boolean;
};

type ModelsJsonProvider = {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  compat?: ProviderCompat;
  models?: Array<{
    id: string;
    name?: string;
    reasoning?: boolean;
    input?: string[];
    contextWindow?: number;
    maxTokens?: number;
    cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  }>;
};

type ModelsJsonFile = {
  providers?: Record<string, ModelsJsonProvider>;
};

const PRESET_DEFAULTS: Record<
  LocalProviderPreset,
  { providerId: string; baseUrl: string; label: string }
> = {
  lmstudio: {
    providerId: "lmstudio",
    baseUrl: "http://localhost:1234/v1",
    label: "LM Studio",
  },
  ollama: {
    providerId: "ollama",
    baseUrl: "http://localhost:11434/v1",
    label: "Ollama",
  },
  apicursor: {
    providerId: "cursorapi",
    baseUrl: "http://127.0.0.1:8787/v1",
    label: "API for Cursor",
  },
  custom: {
    providerId: "local-openai",
    baseUrl: "http://localhost:8080/v1",
    label: "Custom server",
  },
};

const FIXED_MANAGED_PROVIDER_IDS = new Set([
  PRESET_DEFAULTS.lmstudio.providerId,
  PRESET_DEFAULTS.ollama.providerId,
  PRESET_DEFAULTS.apicursor.providerId,
]);

const SHARED_PROVIDER_DEFAULTS = {
  api: "openai-completions",
  apiKey: "local",
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
  },
} as const;

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** API for Cursor uses this token to mean “use the key stored in that app”. */
const API_FOR_CURSOR_LOCAL_KEY = "cursor-local";

const FETCH_TIMEOUT_MS = 8_000;

function modelsJsonPath(): string {
  return path.join(getPiAgentDir(), "models.json");
}

function isApiForCursorUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(normalizeProviderBaseUrl(trimmed));
    return parsed.port === "8787";
  } catch {
    return /:8787(?:\/|$)/.test(trimmed);
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Ensure OpenAI-compatible base URLs include `/v1` when only host:port was entered. */
function normalizeProviderBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, "") || "";
    if (path === "" || path === "/") {
      parsed.pathname = "/v1";
      return normalizeBaseUrl(parsed.toString());
    }
    return normalizeBaseUrl(trimmed);
  } catch {
    return normalizeBaseUrl(trimmed);
  }
}

function resolveModelsListUrl(baseUrl: string): string {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  if (normalized.endsWith("/models")) return normalized;
  const apiRoot = normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
  return `${apiRoot}/models`;
}

function modelsListUrlCandidates(baseUrl: string): string[] {
  const primary = resolveModelsListUrl(baseUrl);
  const candidates = [primary];
  try {
    const parsed = new URL(primary);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      candidates.push(parsed.toString());
    }
  } catch {
    // keep primary only
  }
  return [...new Set(candidates)];
}

function defaultProviderConfig(preset: LocalProviderPreset): LocalProviderConfig {
  const defaults = PRESET_DEFAULTS[preset];
  return {
    preset,
    enabled: false,
    baseUrl: defaults.baseUrl,
    providerId: defaults.providerId,
    models: [],
  };
}

function readModelsJsonRaw(): { data: ModelsJsonFile | null; parseError?: string } {
  const file = modelsJsonPath();
  if (!existsSync(file)) {
    return { data: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { data: null, parseError: "models.json must be a JSON object." };
    }
    return { data: parsed as ModelsJsonFile };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, parseError: `Failed to parse models.json: ${message}` };
  }
}

function findPresetForProviderId(providerId: string): LocalProviderPreset | null {
  if (providerId === PRESET_DEFAULTS.lmstudio.providerId) return "lmstudio";
  if (providerId === PRESET_DEFAULTS.ollama.providerId) return "ollama";
  if (providerId === PRESET_DEFAULTS.apicursor.providerId) return "apicursor";
  return null;
}

function hasManagedCompat(provider: ModelsJsonProvider): boolean {
  const compat = provider.compat;
  return (
    provider.api === SHARED_PROVIDER_DEFAULTS.api &&
    compat?.supportsDeveloperRole === SHARED_PROVIDER_DEFAULTS.compat.supportsDeveloperRole &&
    compat?.supportsReasoningEffort === SHARED_PROVIDER_DEFAULTS.compat.supportsReasoningEffort
  );
}

function isApiForCursorManagedProvider(
  providerId: string,
  provider: ModelsJsonProvider,
): boolean {
  if (providerId === PRESET_DEFAULTS.apicursor.providerId) return true;
  return isApiForCursorUrl(provider.baseUrl?.trim() ?? "");
}

function findApiForCursorProvider(
  providers: Record<string, ModelsJsonProvider>,
): { providerId: string; provider: ModelsJsonProvider } | null {
  const defaultId = PRESET_DEFAULTS.apicursor.providerId;
  if (providers[defaultId]) {
    return { providerId: defaultId, provider: providers[defaultId]! };
  }
  for (const [providerId, provider] of Object.entries(providers)) {
    if (isApiForCursorManagedProvider(providerId, provider)) {
      return { providerId, provider };
    }
  }
  return null;
}

function isCustomManagedProvider(
  providerId: string,
  provider: ModelsJsonProvider,
): boolean {
  if (providerId === PRESET_DEFAULTS.lmstudio.providerId) return false;
  if (providerId === PRESET_DEFAULTS.ollama.providerId) return false;
  if (providerId === PRESET_DEFAULTS.apicursor.providerId) return false;
  if (isApiForCursorUrl(provider.baseUrl?.trim() ?? "")) return false;
  if (providerId === PRESET_DEFAULTS.custom.providerId) return true;
  return hasManagedCompat(provider);
}

function findCustomProvider(
  providers: Record<string, ModelsJsonProvider>,
): { providerId: string; provider: ModelsJsonProvider } | null {
  const defaultId = PRESET_DEFAULTS.custom.providerId;
  if (providers[defaultId] && isCustomManagedProvider(defaultId, providers[defaultId]!)) {
    return { providerId: defaultId, provider: providers[defaultId]! };
  }
  for (const [providerId, provider] of Object.entries(providers)) {
    if (isCustomManagedProvider(providerId, provider)) {
      return { providerId, provider };
    }
  }
  return null;
}

function serverApiKeyForUi(
  preset: LocalProviderPreset,
  apiKey: string | undefined,
): string | undefined {
  if (preset === "apicursor") return undefined;
  if (!apiKey || apiKey === SHARED_PROVIDER_DEFAULTS.apiKey) return undefined;
  if (apiKey === API_FOR_CURSOR_LOCAL_KEY) return undefined;
  return apiKey;
}

function providerToUiConfig(
  preset: LocalProviderPreset,
  providerId: string,
  provider: ModelsJsonProvider | undefined,
): LocalProviderConfig {
  const defaults = PRESET_DEFAULTS[preset];
  if (!provider) {
    return defaultProviderConfig(preset);
  }

  const models = (provider.models ?? []).map((model) => ({
    id: model.id,
    name: model.name,
    enabled: true,
  }));

  const baseUrl = normalizeProviderBaseUrl(provider.baseUrl?.trim() || defaults.baseUrl);

  return {
    preset,
    enabled: models.length > 0 || Boolean(provider.baseUrl),
    baseUrl,
    providerId: preset === "apicursor" ? defaults.providerId : providerId,
    serverApiKey: serverApiKeyForUi(preset, provider.apiKey),
    models,
  };
}

export function hasLocalProviderConfigured(): boolean {
  const state = getLocalProviders();
  return state.providers.some(
    (provider) =>
      provider.enabled &&
      provider.baseUrl.trim().length > 0 &&
      provider.models.some((model) => model.enabled),
  );
}

export function getLocalProviders(): LocalProvidersState {
  const { data, parseError } = readModelsJsonRaw();
  const providers: LocalProviderConfig[] = [];
  const seenPresets = new Set<LocalProviderPreset>();
  const fileProviders = data?.providers ?? {};

  for (const [providerId, providerConfig] of Object.entries(fileProviders)) {
    const preset = findPresetForProviderId(providerId);
    if (!preset) continue;
    seenPresets.add(preset);
    providers.push(providerToUiConfig(preset, providerId, providerConfig));
  }

  const apiCursorEntry = findApiForCursorProvider(fileProviders);
  if (apiCursorEntry && !seenPresets.has("apicursor")) {
    seenPresets.add("apicursor");
    providers.push(
      providerToUiConfig("apicursor", apiCursorEntry.providerId, apiCursorEntry.provider),
    );
  }

  const customEntry = findCustomProvider(fileProviders);
  if (customEntry) {
    seenPresets.add("custom");
    providers.push(
      providerToUiConfig("custom", customEntry.providerId, customEntry.provider),
    );
  }

  for (const preset of Object.keys(PRESET_DEFAULTS) as LocalProviderPreset[]) {
    if (!seenPresets.has(preset)) {
      providers.push(defaultProviderConfig(preset));
    }
  }

  providers.sort((a, b) => {
    const order: LocalProviderPreset[] = ["lmstudio", "ollama", "apicursor", "custom"];
    return order.indexOf(a.preset) - order.indexOf(b.preset);
  });

  return {
    providers,
    modelsJsonPath: modelsJsonPath(),
    ...(parseError ? { parseError } : {}),
  };
}

function resolveProviderId(config: LocalProviderConfig): string {
  const trimmed = config.providerId?.trim();
  if (trimmed) return trimmed;
  return PRESET_DEFAULTS[config.preset].providerId;
}

function resolveProviderApiKey(config: LocalProviderConfig): string {
  if (config.preset === "apicursor") {
    return API_FOR_CURSOR_LOCAL_KEY;
  }
  if (config.preset === "custom") {
    return config.serverApiKey?.trim() || "";
  }
  return config.serverApiKey?.trim() || SHARED_PROVIDER_DEFAULTS.apiKey;
}

function validateProviderConfig(config: LocalProviderConfig): void {
  if (!config.enabled) return;

  const baseUrl = config.baseUrl.trim();
  if (!baseUrl) {
    throw new Error(`${PRESET_DEFAULTS[config.preset].label}: server URL is required.`);
  }

  const enabledModels = config.models.filter((model) => model.enabled && model.id.trim());
  if (enabledModels.length === 0) {
    throw new Error(
      `${PRESET_DEFAULTS[config.preset].label}: add at least one model before enabling.`,
    );
  }

  const providerId = resolveProviderId(config);
  if (!providerId) {
    throw new Error(`${PRESET_DEFAULTS[config.preset].label}: provider id is required.`);
  }

  if (config.preset === "custom") {
    if (
      providerId === PRESET_DEFAULTS.lmstudio.providerId ||
      providerId === PRESET_DEFAULTS.ollama.providerId ||
      providerId === PRESET_DEFAULTS.apicursor.providerId
    ) {
      throw new Error(
        `${PRESET_DEFAULTS.custom.label}: provider id cannot be lmstudio, ollama, or cursorapi.`,
      );
    }
    if (providerId.includes("/")) {
      throw new Error(`${PRESET_DEFAULTS.custom.label}: provider id cannot contain "/".`);
    }
    if (!config.serverApiKey?.trim()) {
      throw new Error(`${PRESET_DEFAULTS.custom.label}: API key is required.`);
    }
  }
}

function buildProviderEntry(config: LocalProviderConfig): ModelsJsonProvider {
  const enabledModels = config.models.filter((model) => model.enabled && model.id.trim());
  const serverApiKey = resolveProviderApiKey(config);
  return {
    baseUrl: normalizeProviderBaseUrl(config.baseUrl),
    api: SHARED_PROVIDER_DEFAULTS.api,
    apiKey: serverApiKey || SHARED_PROVIDER_DEFAULTS.apiKey,
    authHeader: true,
    compat: { ...SHARED_PROVIDER_DEFAULTS.compat },
    models: enabledModels.map((model) => ({
      id: model.id.trim(),
      ...(model.name?.trim() ? { name: model.name.trim() } : {}),
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 8192,
      cost: { ...ZERO_COST },
    })),
  };
}

export function setLocalProviders(providers: LocalProviderConfig[]): void {
  for (const config of providers) {
    validateProviderConfig(config);
  }

  const { data } = readModelsJsonRaw();
  const merged: ModelsJsonFile = {
    providers: { ...(data?.providers ?? {}) },
  };

  const previousApiCursor = findApiForCursorProvider(merged.providers ?? {});
  const previousCustom = findCustomProvider(merged.providers ?? {});
  const idsToRemove = new Set<string>(FIXED_MANAGED_PROVIDER_IDS);
  if (previousApiCursor) {
    idsToRemove.add(previousApiCursor.providerId);
  }
  if (previousCustom) {
    idsToRemove.add(previousCustom.providerId);
  }

  for (const id of idsToRemove) {
    delete merged.providers![id];
  }

  for (const config of providers) {
    if (!config.enabled) continue;
    const providerId = resolveProviderId(config);
    merged.providers![providerId] = buildProviderEntry(config);
  }

  writeModelsJsonFile(merged);
}

function writeModelsJsonFile(data: ModelsJsonFile): void {
  ensurePiAgentDir();
  const file = modelsJsonPath();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Normalize legacy API-for-Cursor entries to the dedicated cursorapi provider. */
export function migrateApiForCursorProvidersInFile(): boolean {
  const { data } = readModelsJsonRaw();
  if (!data?.providers) return false;

  const entry = findApiForCursorProvider(data.providers);
  if (!entry) return false;

  let changed = false;
  const canonicalId = PRESET_DEFAULTS.apicursor.providerId;
  const provider = { ...entry.provider };

  if (entry.providerId !== canonicalId) {
    delete data.providers[entry.providerId];
    changed = true;
  }

  if (
    !provider.apiKey ||
    provider.apiKey === SHARED_PROVIDER_DEFAULTS.apiKey ||
    provider.apiKey === "local"
  ) {
    provider.apiKey = API_FOR_CURSOR_LOCAL_KEY;
    changed = true;
  }

  if (!provider.authHeader) {
    provider.authHeader = true;
    changed = true;
  }

  const existing = data.providers[canonicalId];
  if (!existing || existing !== provider) {
    data.providers[canonicalId] = provider;
    changed = true;
  }

  if (!changed) return false;
  writeModelsJsonFile(data);
  return true;
}

function friendlyFetchError(err: unknown, attemptedUrl?: string): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return attemptedUrl
        ? `Connection timed out at ${attemptedUrl}. Is the local server running?`
        : "Connection timed out. Is the local server running?";
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ECONNREFUSED") {
      return attemptedUrl
        ? `Connection refused at ${attemptedUrl}. Confirm the server is started and the URL/port match your app (LM Studio: Developer → Local Server).`
        : "Connection refused. Start the local server and try again.";
    }
    return err.message;
  }
  return String(err);
}

function parseModelsResponse(body: unknown): DiscoveredLocalModel[] {
  const models: DiscoveredLocalModel[] = [];

  const pushItem = (id: unknown, name?: unknown) => {
    const modelId = typeof id === "string" ? id.trim() : "";
    if (!modelId) return;
    const modelName = typeof name === "string" ? name.trim() : undefined;
    models.push({ id: modelId, ...(modelName ? { name: modelName } : {}) });
  };

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      for (const item of record.data) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        pushItem(entry.id, entry.name);
      }
    }
    if (models.length === 0 && Array.isArray(record.models)) {
      for (const item of record.models) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        pushItem(entry.id ?? entry.name, entry.name);
      }
    }
  }

  return models;
}

async function fetchModelsAtUrl(
  url: string,
  apiKey?: string,
): Promise<DiscoveredLocalModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    const token = apiKey?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { signal: controller.signal, headers });
    if (response.status === 401) {
      throw new Error(
        "Server rejected the request (401). If LM Studio API tokens are enabled, add your token below.",
      );
    }
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText} at ${url}`);
    }
    const body: unknown = await response.json();
    return parseModelsResponse(body);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchModelsFromServer(
  baseUrl: string,
  apiKey?: string,
): Promise<DiscoveredLocalModel[]> {
  const candidates = modelsListUrlCandidates(baseUrl);
  let lastError: unknown;
  for (const url of candidates) {
    try {
      return await fetchModelsAtUrl(url, apiKey);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`Could not reach ${candidates[0] ?? baseUrl}`);
}

export async function discoverLocalModels(options: {
  baseUrl: string;
  apiKey?: string;
}): Promise<DiscoverLocalModelsResult> {
  const baseUrl = options.baseUrl.trim();
  if (!baseUrl) {
    return { ok: false, error: "Server URL is required." };
  }
  const attemptedUrl = resolveModelsListUrl(baseUrl);
  try {
    const models = await fetchModelsFromServer(baseUrl, options.apiKey);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: friendlyFetchError(err, attemptedUrl) };
  }
}

export async function testLocalConnection(options: {
  baseUrl: string;
  apiKey?: string;
}): Promise<TestLocalConnectionResult> {
  const baseUrl = options.baseUrl.trim();
  if (!baseUrl) {
    return { ok: false, error: "Server URL is required." };
  }
  const attemptedUrl = resolveModelsListUrl(baseUrl);
  try {
    const models = await fetchModelsFromServer(baseUrl, options.apiKey);
    return { ok: true, modelCount: models.length };
  } catch (err) {
    return { ok: false, error: friendlyFetchError(err, attemptedUrl) };
  }
}

export function presetLabel(preset: LocalProviderPreset): string {
  return PRESET_DEFAULTS[preset].label;
}
