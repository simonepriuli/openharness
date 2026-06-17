import { LocalProvidersSettings } from "./LocalProvidersSettings";

type LocalProvidersSettingsViewProps = {
  saving: boolean;
  onSettingsChanged?: () => void;
};

export function LocalProvidersSettingsView({
  saving,
  onSettingsChanged,
}: LocalProvidersSettingsViewProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Local providers</h2>
      <p className="settings-muted settings-section-lead">
        Connect LM Studio, Ollama, API for Cursor, or other OpenAI-compatible local servers.
        OpenHarness writes discovered models to Pi&apos;s <code>models.json</code>.
      </p>
      <LocalProvidersSettings saving={saving} onSaved={onSettingsChanged} />
    </div>
  );
}
