import { useEffect, useState } from "react";
import type { HarnessSettings } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";
import { SettingsModelPicker } from "./SettingsModelPicker";

type SwarmSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  sessionKey: string | null;
  onSaveSwarmDefaultModel: (modelRef: string) => Promise<void>;
};

export function SwarmSettings({
  settings,
  saving,
  sessionKey,
  onSaveSwarmDefaultModel,
}: SwarmSettingsProps) {
  const [defaultModel, setDefaultModel] = useState(settings.swarmDefaultModel);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setDefaultModel(settings.swarmDefaultModel);
  }, [settings.swarmDefaultModel]);

  const saveSelection = async (modelRef: string) => {
    setError(null);
    setSavedMessage(null);
    try {
      const next = modelRef.trim();
      await onSaveSwarmDefaultModel(next);
      setSavedMessage(`Swarm default model set to ${next}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save swarm settings");
    }
  };

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Swarm</h2>

      <SettingsCard title="Default sub-agent model" padded={false} overflowVisible>
      <div className="settings-row">
        <div className="settings-row-text">
          <p className="settings-row-description">
            Model used by <code>swarm_dispatch</code> when a sub-agent model is not specified.
          </p>
          {error ? <p className="settings-error settings-row-feedback">{error}</p> : null}
          {savedMessage ? (
            <p className="settings-status settings-row-feedback">{savedMessage}</p>
          ) : null}
        </div>

        <SettingsModelPicker
          value={defaultModel}
          onChange={(modelRef) => {
            setDefaultModel(modelRef);
            void saveSelection(modelRef);
          }}
          sessionKey={sessionKey}
          disabled={saving}
          emptyLabel="Select swarm model"
          panelAriaLabel="Select swarm model"
          listAriaLabel="Swarm models"
        />

      </div>
      </SettingsCard>
    </div>
  );
}
