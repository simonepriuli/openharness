import { useCallback, useEffect, useState } from "react";
import type { CloudProviderInfo, OpenRouterManagementStatus } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";

const PROVIDER_KEY_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys/",
  deepseek: "https://platform.deepseek.com/api_keys",
};

const OPENROUTER_MANAGEMENT_KEYS_URL = "https://openrouter.ai/settings/management-keys";

type CloudProvidersSettingsProps = {
  saving: boolean;
  openrouterManagement: OpenRouterManagementStatus;
  onSettingsChanged?: () => void;
  onSaveManagementKey: (apiKey: string) => Promise<void>;
  onRemoveManagementKey: () => Promise<void>;
};

type ProviderKeyState = {
  apiKey: string;
  error: string | null;
  savedMessage: string | null;
};

function emptyKeyState(): ProviderKeyState {
  return { apiKey: "", error: null, savedMessage: null };
}

export function CloudProvidersSettings({
  saving,
  openrouterManagement,
  onSettingsChanged,
  onSaveManagementKey,
  onRemoveManagementKey,
}: CloudProvidersSettingsProps) {
  const [providers, setProviders] = useState<CloudProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyState, setKeyState] = useState<Record<string, ProviderKeyState>>({});
  const [managementKey, setManagementKey] = useState("");
  const [managementError, setManagementError] = useState<string | null>(null);
  const [managementSavedMessage, setManagementSavedMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.harness.getCloudProviders();
      setProviders(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load cloud providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateKeyState = (providerId: string, patch: Partial<ProviderKeyState>) => {
    setKeyState((prev) => ({
      ...prev,
      [providerId]: { ...(prev[providerId] ?? emptyKeyState()), ...patch },
    }));
  };

  const handleSave = async (provider: CloudProviderInfo) => {
    const state = keyState[provider.id] ?? emptyKeyState();
    updateKeyState(provider.id, { error: null, savedMessage: null });
    if (!state.apiKey.trim()) {
      updateKeyState(provider.id, { error: "Enter an API key before saving." });
      return;
    }
    try {
      await window.harness.setProviderApiKey({
        provider: provider.id,
        apiKey: state.apiKey.trim(),
      });
      updateKeyState(provider.id, {
        apiKey: "",
        savedMessage: `${provider.displayName} API key saved.`,
      });
      await reload();
      onSettingsChanged?.();
    } catch (err) {
      updateKeyState(provider.id, {
        error: err instanceof Error ? err.message : "Failed to save API key",
      });
    }
  };

  const handleRemove = async (provider: CloudProviderInfo) => {
    updateKeyState(provider.id, { error: null, savedMessage: null });
    try {
      await window.harness.clearProviderApiKey({ provider: provider.id });
      updateKeyState(provider.id, {
        apiKey: "",
        savedMessage: `${provider.displayName} API key removed.`,
      });
      await reload();
      onSettingsChanged?.();
    } catch (err) {
      updateKeyState(provider.id, {
        error: err instanceof Error ? err.message : "Failed to remove API key",
      });
    }
  };

  const handleSaveManagement = async () => {
    setManagementError(null);
    setManagementSavedMessage(null);
    if (!managementKey.trim()) {
      setManagementError("Enter a management key before saving.");
      return;
    }
    try {
      await onSaveManagementKey(managementKey.trim());
      setManagementKey("");
      setManagementSavedMessage("Management key saved.");
      onSettingsChanged?.();
    } catch (err) {
      setManagementError(
        err instanceof Error ? err.message : "Failed to save management key",
      );
    }
  };

  const handleRemoveManagement = async () => {
    setManagementError(null);
    setManagementSavedMessage(null);
    try {
      await onRemoveManagementKey();
      setManagementKey("");
      setManagementSavedMessage("Management key removed.");
      onSettingsChanged?.();
    } catch (err) {
      setManagementError(
        err instanceof Error ? err.message : "Failed to remove management key",
      );
    }
  };

  if (loading) {
    return <p className="settings-muted">Loading cloud providers…</p>;
  }

  if (loadError) {
    return <p className="settings-error">{loadError}</p>;
  }

  return (
    <div className="settings-cloud-providers">
      {providers.map((provider) => {
        const state = keyState[provider.id] ?? emptyKeyState();
        const keyUrl = PROVIDER_KEY_URLS[provider.id];
        const envConfigured = provider.source === "environment";
        const canEdit = !envConfigured;
        const isOpenRouter = provider.id === "openrouter";

        return (
          <SettingsCard
            key={provider.id}
            title={provider.displayName}
            className="settings-api-section"
          >
            <p className="settings-api-description">
              Inference API key stored in your Pi config directory as <code>auth.json</code>.
              {provider.configured && provider.maskedHint ? (
                <>
                  {" "}
                  Current key:{" "}
                  <span className="settings-key-hint">{provider.maskedHint}</span>.
                </>
              ) : null}
              {envConfigured && provider.envVar ? (
                <>
                  {" "}
                  Configured via environment variable{" "}
                  <code>{provider.envVar}</code>.
                </>
              ) : null}
              {keyUrl ? (
                <>
                  {" "}
                  <a
                    className="settings-link settings-link-inline"
                    href={keyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get a key
                  </a>
                </>
              ) : null}
            </p>

            {canEdit ? (
              <>
                <input
                  type="password"
                  className="settings-api-input"
                  placeholder={
                    provider.configured ? "Paste a new key to replace" : "API key"
                  }
                  value={state.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving}
                  onChange={(e) =>
                    updateKeyState(provider.id, { apiKey: e.target.value })
                  }
                />

                {state.error ? (
                  <p className="settings-error settings-api-feedback">{state.error}</p>
                ) : null}
                {state.savedMessage ? (
                  <p className="settings-status settings-api-feedback">{state.savedMessage}</p>
                ) : null}

                <div className="settings-api-actions">
                  {provider.configured && provider.source === "stored" ? (
                    <button
                      type="button"
                      className="settings-button settings-button-ghost"
                      disabled={saving}
                      onClick={() => void handleRemove(provider)}
                    >
                      Remove key
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="settings-button settings-button-save"
                    disabled={saving}
                    onClick={() => void handleSave(provider)}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : null}

            {isOpenRouter ? (
              <div className="settings-provider-subsection">
                <h4 className="settings-provider-subsection-title">Management key</h4>
                <p className="settings-api-description">
                  Used only to show account credits and usage in the workspace panel. Stored
                  locally as <code>openrouter-management.json</code> (not in{" "}
                  <code>auth.json</code>).
                  {openrouterManagement.configured && openrouterManagement.maskedHint ? (
                    <>
                      {" "}
                      Current key:{" "}
                      <span className="settings-key-hint">
                        {openrouterManagement.maskedHint}
                      </span>
                      .
                    </>
                  ) : null}{" "}
                  <a
                    className="settings-link settings-link-inline"
                    href={OPENROUTER_MANAGEMENT_KEYS_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create a management key
                  </a>
                </p>

                <input
                  type="password"
                  className="settings-api-input"
                  placeholder={
                    openrouterManagement.configured
                      ? "Paste a new management key to replace"
                      : "Management key"
                  }
                  value={managementKey}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving}
                  onChange={(e) => setManagementKey(e.target.value)}
                />

                {managementError ? (
                  <p className="settings-error settings-api-feedback">{managementError}</p>
                ) : null}
                {managementSavedMessage ? (
                  <p className="settings-status settings-api-feedback">
                    {managementSavedMessage}
                  </p>
                ) : null}

                <div className="settings-api-actions">
                  {openrouterManagement.configured ? (
                    <button
                      type="button"
                      className="settings-button settings-button-ghost"
                      disabled={saving}
                      onClick={() => void handleRemoveManagement()}
                    >
                      Remove key
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="settings-button settings-button-save"
                    disabled={saving}
                    onClick={() => void handleSaveManagement()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </SettingsCard>
        );
      })}
    </div>
  );
}
