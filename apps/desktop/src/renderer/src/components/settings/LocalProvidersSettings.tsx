import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  DiscoveredLocalModel,
  LocalProviderConfig,
  LocalProviderPreset,
  LocalProvidersState,
} from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";
import { SettingsToggle } from "./SettingsToggle";

const PRESET_META: Record<
  LocalProviderPreset,
  { title: string; description: string; defaultProviderId: string }
> = {
  lmstudio: {
    title: "LM Studio",
    description: "Local OpenAI-compatible server from LM Studio.",
    defaultProviderId: "lmstudio",
  },
  ollama: {
    title: "Ollama",
    description: "Local OpenAI-compatible server from Ollama.",
    defaultProviderId: "ollama",
  },
  apicursor: {
    title: "API for Cursor",
    description:
      "Local Composer models from the API for Cursor app. Save your Cursor key in that app — OpenHarness connects automatically.",
    defaultProviderId: "cursorapi",
  },
  custom: {
    title: "Custom server",
    description: "Any other OpenAI-compatible local or self-hosted endpoint.",
    defaultProviderId: "local-openai",
  },
};

type LocalProvidersSettingsProps = {
  saving: boolean;
  onSaved?: () => void;
};

function cloneProviders(providers: LocalProviderConfig[]): LocalProviderConfig[] {
  return providers.map((provider) => ({
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  }));
}

function updateProvider(
  providers: LocalProviderConfig[],
  preset: LocalProviderPreset,
  patch: Partial<LocalProviderConfig>,
): LocalProviderConfig[] {
  return providers.map((provider) =>
    provider.preset === preset ? { ...provider, ...patch } : provider,
  );
}

type ProviderCardProps = {
  config: LocalProviderConfig;
  disabled: boolean;
  onChange: (patch: Partial<LocalProviderConfig>) => void;
};

function isEmbeddingModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.includes("embed") ||
    lower.includes("embedding") ||
    lower.includes("nomic-embed")
  );
}

type ActionFeedback = "idle" | "loading" | "success" | "error";

type ActionButtonState = {
  feedback: ActionFeedback;
  label: string;
  title?: string;
};

function truncateForButton(text: string, max = 36): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function actionButtonClass(feedback: ActionFeedback): string {
  const base = "settings-button settings-button-secondary settings-action-button";
  if (feedback === "success") return `${base} settings-action-button-success`;
  if (feedback === "error") return `${base} settings-action-button-error`;
  return base;
}

function mergeDiscoveredModels(
  current: LocalProviderConfig["models"],
  discovered: DiscoveredLocalModel[],
): LocalProviderConfig["models"] {
  const byId = new Map(current.map((model) => [model.id, model]));
  for (const model of discovered) {
    const existing = byId.get(model.id);
    if (existing) {
      byId.set(model.id, {
        ...existing,
        name: model.name ?? existing.name,
      });
      continue;
    }
    byId.set(model.id, {
      id: model.id,
      name: model.name,
      enabled: !isEmbeddingModelId(model.id),
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function effectiveServerApiKey(config: LocalProviderConfig): string | undefined {
  if (config.preset === "apicursor") {
    return "cursor-local";
  }
  return config.serverApiKey?.trim() || undefined;
}

function ProviderCard({ config, disabled, onChange }: ProviderCardProps) {
  const meta = PRESET_META[config.preset];
  const [testState, setTestState] = useState<ActionButtonState>({
    feedback: "idle",
    label: "Test connection",
  });
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [manualModelId, setManualModelId] = useState("");
  const autoRefreshStartedRef = useRef(false);

  useEffect(() => {
    setTestState({ feedback: "idle", label: "Test connection" });
    setRefreshError(null);
    autoRefreshStartedRef.current = false;
  }, [config.baseUrl, config.serverApiKey]);

  const connectionOptions = useCallback(() => {
    const apiKey = effectiveServerApiKey(config);
    return {
      baseUrl: config.baseUrl,
      ...(apiKey ? { apiKey } : {}),
    };
  }, [config]);

  const refreshModels = useCallback(async () => {
    setRefreshLoading(true);
    setRefreshError(null);
    try {
      const result = await window.harness.discoverLocalModels(connectionOptions());
      if (!result.ok) {
        setRefreshError(result.error);
        return;
      }
      if (result.models.length > 0) {
        const merged = mergeDiscoveredModels(config.models, result.models);
        onChange({ models: merged });
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Failed to refresh models");
    } finally {
      setRefreshLoading(false);
    }
  }, [config.models, connectionOptions, onChange]);

  useEffect(() => {
    if (autoRefreshStartedRef.current) return;
    if (!config.baseUrl.trim()) return;
    if (!config.enabled && config.models.length === 0) return;
    autoRefreshStartedRef.current = true;
    void refreshModels();
  }, [config.baseUrl, config.enabled, config.models.length, refreshModels]);

  const prevEnabledRef = useRef(config.enabled);
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = config.enabled;
    if (!config.enabled || wasEnabled) return;
    if (!config.baseUrl.trim()) return;
    void refreshModels();
  }, [config.enabled, config.baseUrl, refreshModels]);

  const handleTest = async () => {
    setTestState({ feedback: "loading", label: "Testing…" });
    try {
      const result = await window.harness.testLocalConnection(connectionOptions());
      if (result.ok) {
        const label =
          result.modelCount === 1
            ? "Connected · 1 model"
            : `Connected · ${result.modelCount} models`;
        setTestState({ feedback: "success", label });
        return;
      }
      setTestState({
        feedback: "error",
        label: truncateForButton(result.error),
        title: result.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setTestState({
        feedback: "error",
        label: truncateForButton(message),
        title: message,
      });
    }
  };

  const setModelEnabled = (id: string, enabled: boolean) => {
    onChange({
      models: config.models.map((entry) =>
        entry.id === id ? { ...entry, enabled } : entry,
      ),
    });
  };

  const addManualModel = () => {
    const id = manualModelId.trim();
    if (!id) return;
    if (config.models.some((entry) => entry.id === id)) {
      onChange({
        models: config.models.map((entry) =>
          entry.id === id ? { ...entry, enabled: true } : entry,
        ),
      });
    } else {
      onChange({
        models: [...config.models, { id, enabled: true }],
      });
    }
    setManualModelId("");
  };

  const sortedModels = [...config.models].sort((a, b) => a.id.localeCompare(b.id));
  const enabledCount = config.models.filter((model) => model.enabled).length;
  const urlPlaceholder =
    config.preset === "apicursor"
      ? "http://127.0.0.1:8787/v1"
      : config.preset === "custom"
        ? "http://localhost:8080/v1"
        : "http://localhost:1234/v1";

  return (
    <SettingsCard title={meta.title} padded={false}>
      <div className="settings-row">
        <div className="settings-row-text">
          <p className="settings-row-description">{meta.description}</p>
        </div>
        <SettingsToggle
          label={`Enable ${meta.title}`}
          checked={config.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>

      <div className="settings-row settings-row-stack">
        <div className="settings-row-text">
          <div className="settings-row-label">Server URL</div>
        </div>
        <input
          type="url"
          className="settings-input"
          value={config.baseUrl}
          placeholder={urlPlaceholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
        />
      </div>

      {config.preset === "custom" ? (
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">Provider id</div>
            <p className="settings-row-description">
              Used in the model picker as <code>provider/model</code>.
            </p>
          </div>
          <input
            type="text"
            className="settings-input"
            value={config.providerId ?? meta.defaultProviderId}
            placeholder={meta.defaultProviderId}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => onChange({ providerId: e.target.value })}
          />
        </div>
      ) : null}

      {config.preset === "apicursor" ? (
        <div className="settings-row settings-row-stack">
          <p className="settings-muted settings-row-feedback">
            Your Cursor API key stays in the API for Cursor app. After saving or changing the
            key there, click Stop → Start in that app. Models appear as{" "}
            <code>cursorapi/model</code>.
          </p>
        </div>
      ) : (
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">
              {config.preset === "custom" ? "API key" : "API token (optional)"}
            </div>
            <p className="settings-row-description">
              {config.preset === "custom"
                ? "Required for servers that authenticate requests."
                : "Only if your local server requires authentication (LM Studio: enable in server settings)."}
            </p>
          </div>
          <input
            type="password"
            className="settings-input"
            value={config.serverApiKey ?? ""}
            placeholder={config.preset === "custom" ? "Server API key" : "Bearer token"}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => onChange({ serverApiKey: e.target.value })}
          />
        </div>
      )}

      <div className="settings-row settings-row-stack">
        <div className="settings-button-row">
          <button
            type="button"
            className={actionButtonClass(testState.feedback)}
            disabled={disabled || testState.feedback === "loading"}
            title={testState.title}
            onClick={() => void handleTest()}
          >
            {testState.label}
          </button>
          <button
            type="button"
            className={`settings-button settings-button-secondary settings-icon-button${
              refreshError ? " settings-action-button-error" : ""
            }`}
            disabled={disabled || refreshLoading}
            title={refreshError ?? "Refresh models from server"}
            aria-label="Refresh models from server"
            onClick={() => void refreshModels()}
          >
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              size={16}
              strokeWidth={1.8}
              className={refreshLoading ? "settings-icon-spin" : undefined}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div className="settings-row settings-row-stack">
        <div className="settings-row-text">
          <div className="settings-row-label">Models for chat</div>
          <p className="settings-row-description">
            Turn on a model to show it in the chat model picker. Models that are off stay
            hidden.
          </p>
        </div>
        {sortedModels.length === 0 ? (
          <p className="settings-muted settings-row-feedback">
            {refreshLoading
              ? "Loading models from server…"
              : "No models yet. Enable this provider or use the refresh button."}
          </p>
        ) : (
          <ul className="settings-selected-models" aria-label={`${meta.title} models`}>
            {sortedModels.map((model) => {
              const embedding = isEmbeddingModelId(model.id);
              const label = model.name?.trim() ? `${model.name} (${model.id})` : model.id;
              return (
                <li key={model.id} className="settings-selected-model">
                  <span className="settings-selected-model-name">{label}</span>
                  {embedding ? (
                    <span className="settings-local-model-tag">Embedding</span>
                  ) : null}
                  <SettingsToggle
                    label={`Use ${model.id} in chat`}
                    checked={model.enabled}
                    disabled={disabled}
                    onChange={(value) => setModelEnabled(model.id, value)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {sortedModels.length > 0 ? (
          <p className="settings-muted settings-row-feedback">
            {enabledCount === 0
              ? "No models on for chat yet."
              : `${enabledCount} model${enabledCount === 1 ? "" : "s"} on for chat.`}
          </p>
        ) : null}
        <div className="settings-local-manual-add">
          <input
            type="text"
            className="settings-input"
            value={manualModelId}
            placeholder="Add model id manually"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => setManualModelId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManualModel();
              }
            }}
          />
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={disabled || !manualModelId.trim()}
            onClick={addManualModel}
          >
            Add
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}

const AUTO_SAVE_DELAY_MS = 500;

export function LocalProvidersSettings({ saving, onSaved }: LocalProvidersSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [providers, setProviders] = useState<LocalProviderConfig[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipAutoSaveRef = useRef(true);
  const saveSeqRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const state: LocalProvidersState = await window.harness.getLocalProviders();
      setProviders(cloneProviders(state.providers));
      setParseError(state.parseError ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load local providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }

    const seq = ++saveSeqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        setSaveError(null);
        try {
          await window.harness.setLocalProviders({ providers });
          if (saveSeqRef.current !== seq) return;
          onSaved?.();
        } catch (err) {
          if (saveSeqRef.current !== seq) return;
          setSaveError(
            err instanceof Error ? err.message : "Failed to save local providers",
          );
        }
      })();
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [providers, loading, onSaved]);

  return (
    <>
      {loading ? <p className="settings-muted">Loading local providers…</p> : null}
      {loadError ? <p className="settings-error">{loadError}</p> : null}
      {parseError ? (
        <p className="settings-error settings-row-feedback">
          {parseError} Fix the file or change settings here to overwrite managed entries.
        </p>
      ) : null}

      {!loading && !loadError
        ? providers.map((config) => (
            <ProviderCard
              key={config.preset}
              config={config}
              disabled={saving}
              onChange={(patch) => {
                setProviders((current) =>
                  updateProvider(current, config.preset, patch),
                );
              }}
            />
          ))
        : null}

      {saveError ? <p className="settings-error settings-row-feedback">{saveError}</p> : null}
    </>
  );
}
