import type { HarnessSettings } from "../../../../preload/api";
import { WebSearchSettings } from "./WebSearchSettings";

type WebSearchSettingsViewProps = {
  settings: HarnessSettings;
  saving: boolean;
  onSaveExaKey: (apiKey: string) => Promise<void>;
  onRemoveExaKey: () => Promise<void>;
};

export function WebSearchSettingsView({
  settings,
  saving,
  onSaveExaKey,
  onRemoveExaKey,
}: WebSearchSettingsViewProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Web search</h2>
      <WebSearchSettings
        saving={saving}
        exa={settings.exa}
        onSaveExaKey={onSaveExaKey}
        onRemoveExaKey={onRemoveExaKey}
      />
    </div>
  );
}
