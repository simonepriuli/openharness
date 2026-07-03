import { TeamsSettings } from "./TeamsSettings";
import { DiscordSettings } from "./DiscordSettings";
import { LinearSettings } from "./LinearSettings";

export function IntegrationsSettingsView({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Integrations</h2>
          <p className="settings-muted settings-section-lead">
            Connect chat, issue tracking, and notification services used by org workflows.
          </p>
        </>
      ) : null}
      <TeamsSettings />
      <DiscordSettings />
      <LinearSettings />
    </div>
  );
}
