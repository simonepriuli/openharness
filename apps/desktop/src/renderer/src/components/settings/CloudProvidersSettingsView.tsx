import type { HarnessSettings } from "../../../../preload/api";
import { CloudProvidersSettings } from "./CloudProvidersSettings";

type CloudProvidersSettingsViewProps = {
  settings: HarnessSettings;
  saving: boolean;
  onSettingsChanged?: () => void;
  onSaveManagementKey: (apiKey: string) => Promise<void>;
  onRemoveManagementKey: () => Promise<void>;
};

export function CloudProvidersSettingsView({
  settings,
  saving,
  onSettingsChanged,
  onSaveManagementKey,
  onRemoveManagementKey,
}: CloudProvidersSettingsViewProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Cloud providers</h2>
      <p className="settings-muted settings-section-lead">
        Add API keys for cloud model providers. Keys are written to Pi&apos;s{" "}
        <code>auth.json</code> in your active config directory.
      </p>
      <CloudProvidersSettings
        saving={saving}
        openrouterManagement={settings.openrouterManagement}
        onSettingsChanged={onSettingsChanged}
        onSaveManagementKey={onSaveManagementKey}
        onRemoveManagementKey={onRemoveManagementKey}
      />
    </div>
  );
}
