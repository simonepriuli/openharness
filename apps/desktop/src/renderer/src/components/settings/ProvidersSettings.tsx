import { LocalProvidersSettings } from "./LocalProvidersSettings";

type ProvidersSettingsProps = {
  saving: boolean;
  onSettingsChanged?: () => void;
};

export function ProvidersSettings({ saving, onSettingsChanged }: ProvidersSettingsProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Local providers</h2>
      <LocalProvidersSettings saving={saving} onSaved={onSettingsChanged} />
    </div>
  );
}
