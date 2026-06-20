import { GithubSettings } from "./GithubSettings";

export function IntegrationsSettingsView() {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Integrations</h2>
      <p className="settings-muted settings-section-lead">
        Connect external services that OpenHarness uses for repository access and automation.
      </p>
      <GithubSettings />
    </div>
  );
}
