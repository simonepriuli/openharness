import { GithubSettings } from "./GithubSettings";
import { AzureDevOpsSettings } from "./AzureDevOpsSettings";

export function SourceControlSettingsView({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Source control</h2>
          <p className="settings-muted settings-section-lead">
            Connect source control providers so your organization can access repositories for
            workflows and automation.
          </p>
        </>
      ) : null}
      <div style={{ display: "grid", gap: "1rem" }}>
        <GithubSettings />
        <AzureDevOpsSettings />
      </div>
    </div>
  );
}
