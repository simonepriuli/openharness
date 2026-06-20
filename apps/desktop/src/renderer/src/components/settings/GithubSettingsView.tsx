import { GithubSettings } from "./GithubSettings";

export function GithubSettingsView() {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">GitHub</h2>
      <GithubSettings />
    </div>
  );
}
