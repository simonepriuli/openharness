import { useState } from "react";
import type { ExaStatus } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";

const EXA_API_KEYS_URL = "https://dashboard.exa.ai/api-keys";

type WebSearchSettingsProps = {
  saving: boolean;
  exa: ExaStatus;
  onSaveExaKey: (apiKey: string) => Promise<void>;
  onRemoveExaKey: () => Promise<void>;
};

export function WebSearchSettings({
  saving,
  exa,
  onSaveExaKey,
  onRemoveExaKey,
}: WebSearchSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const envConfigured = exa.source === "environment";
  const canEdit = !envConfigured;

  const handleSave = async () => {
    setError(null);
    setSavedMessage(null);
    if (!apiKey.trim()) {
      setError("Enter an API key before saving.");
      return;
    }
    try {
      await onSaveExaKey(apiKey.trim());
      setApiKey("");
      setSavedMessage("Exa API key saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    }
  };

  const handleRemove = async () => {
    setError(null);
    setSavedMessage(null);
    try {
      await onRemoveExaKey();
      setApiKey("");
      setSavedMessage("Exa API key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove API key");
    }
  };

  return (
    <SettingsCard title="Exa" className="settings-api-section">
      <p className="settings-api-description">
        Powered by{" "}
        <a className="settings-link settings-link-inline" href="https://exa.ai/" target="_blank" rel="noreferrer">
          Exa
        </a>
        .
        {exa.configured && exa.maskedHint ? (
          <>
            {" "}
            Current key: <span className="settings-key-hint">{exa.maskedHint}</span>.
          </>
        ) : null}
        {envConfigured && exa.envVar ? (
          <>
            {" "}
            Configured via <code>{exa.envVar}</code>.
          </>
        ) : null}{" "}
        <a
          className="settings-link settings-link-inline"
          href={EXA_API_KEYS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Get an API key
        </a>
      </p>

      {canEdit ? (
        <>
          <input
            type="password"
            className="settings-api-input"
            placeholder={exa.configured ? "Paste a new key to replace" : "Exa API key"}
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
            {exa.configured && exa.source === "stored" ? (
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
        </>
      ) : null}
    </SettingsCard>
  );
}
