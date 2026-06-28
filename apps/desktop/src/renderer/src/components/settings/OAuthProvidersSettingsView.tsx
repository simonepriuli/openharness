import { OAuthProvidersSettings } from "./OAuthProvidersSettings";

type OAuthProvidersSettingsViewProps = {
  saving: boolean;
  onSettingsChanged?: () => void;
};

export function OAuthProvidersSettingsView({
  saving,
  onSettingsChanged,
}: OAuthProvidersSettingsViewProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">OAuth providers</h2>
      <p className="settings-muted settings-section-lead">
        Sign in with subscription accounts to use models without API keys.
      </p>
      <OAuthProvidersSettings saving={saving} onSettingsChanged={onSettingsChanged} />
    </div>
  );
}
