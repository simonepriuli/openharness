import { useState } from "react";
import type { HarnessSettings } from "../../../../preload/api";

type ApiSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  onSaveOpenRouterKey: (apiKey: string) => Promise<void>;
  onRemoveOpenRouterKey: () => Promise<void>;
  onSaveManagementKey: (apiKey: string) => Promise<void>;
  onRemoveManagementKey: () => Promise<void>;
};

export function ApiSettings({
  settings,
  saving,
  onSaveOpenRouterKey,
  onRemoveOpenRouterKey,
  onSaveManagementKey,
  onRemoveManagementKey,
}: ApiSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [managementSavedMessage, setManagementSavedMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSavedMessage(null);
    if (!apiKey.trim()) {
      setError("Enter an API key before saving.");
      return;
    }
    try {
      await onSaveOpenRouterKey(apiKey.trim());
      setApiKey("");
      setSavedMessage("OpenRouter API key saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    }
  };

  const handleRemove = async () => {
    setError(null);
    setSavedMessage(null);
    try {
      await onRemoveOpenRouterKey();
      setApiKey("");
      setSavedMessage("OpenRouter API key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove API key");
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
      setManagementSavedMessage("OpenRouter management key saved.");
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
      setManagementSavedMessage("OpenRouter management key removed.");
    } catch (err) {
      setManagementError(
        err instanceof Error ? err.message : "Failed to remove management key",
      );
    }
  };

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">API</h2>

      <div className="settings-api-section">
        <h3 className="settings-api-subtitle">Inference key</h3>
        <p className="settings-api-description">
          API key for models routed through OpenRouter. Stored in your Pi config directory as{" "}
          <code>auth.json</code> (not in this repository).
          {settings.openrouter.configured && settings.openrouter.maskedHint ? (
            <>
              {" "}
              Current key:{" "}
              <span className="settings-key-hint">{settings.openrouter.maskedHint}</span>.
            </>
          ) : null}{" "}
          <a
            className="settings-link settings-link-inline"
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get a key on openrouter.ai
          </a>
        </p>

        <input
          type="password"
          className="settings-api-input"
          placeholder={
            settings.openrouter.configured ? "Paste a new key to replace" : "sk-or-…"
          }
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(e) => setApiKey(e.target.value)}
        />

        {error ? <p className="settings-error settings-api-feedback">{error}</p> : null}
        {savedMessage ? (
          <p className="settings-status settings-api-feedback">{savedMessage}</p>
        ) : null}

        <div className="settings-api-actions">
          {settings.openrouter.configured ? (
            <button
              type="button"
              className="settings-button settings-button-ghost"
              disabled={saving}
              onClick={() => void handleRemove()}
            >
              Remove key
            </button>
          ) : null}
          <button
            type="button"
            className="settings-button settings-button-save"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="settings-api-section">
        <h3 className="settings-api-subtitle">Management key</h3>
        <p className="settings-api-description">
          Used only to show account credits and usage in the workspace panel. Stored locally as{" "}
          <code>openrouter-management.json</code> (not in <code>auth.json</code>).
          {settings.openrouterManagement.configured &&
          settings.openrouterManagement.maskedHint ? (
            <>
              {" "}
              Current key:{" "}
              <span className="settings-key-hint">
                {settings.openrouterManagement.maskedHint}
              </span>
              .
            </>
          ) : null}{" "}
          <a
            className="settings-link settings-link-inline"
            href="https://openrouter.ai/settings/management-keys"
            target="_blank"
            rel="noreferrer"
          >
            Create a management key on openrouter.ai
          </a>
        </p>

        <input
          type="password"
          className="settings-api-input"
          placeholder={
            settings.openrouterManagement.configured
              ? "Paste a new key to replace"
              : "sk-or-…"
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
          <p className="settings-status settings-api-feedback">{managementSavedMessage}</p>
        ) : null}

        <div className="settings-api-actions">
          {settings.openrouterManagement.configured ? (
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
    </div>
  );
}
