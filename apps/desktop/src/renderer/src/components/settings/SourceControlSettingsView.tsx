import { GithubSettings } from "./GithubSettings";

export function SourceControlSettingsView({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Source control</h2>
          <p className="settings-muted settings-section-lead">
            Connect GitHub so your organization can access repositories for workflows and automation.
          </p>
        </>
      ) : null}
      <GithubSettings />
    </div>
  );
}
