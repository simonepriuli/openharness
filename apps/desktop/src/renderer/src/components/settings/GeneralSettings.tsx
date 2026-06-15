import { useCallback, useEffect, useState } from "react";
import type { AppTheme, HarnessSettings } from "../../../../preload/api";
import { importSessionsFromGlobalPi } from "../../lib/chat-storage";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { SettingsToggle } from "./SettingsToggle";

type GeneralSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  onUseGlobalPiConfigChange: (value: boolean) => Promise<void>;
  onThemeChange: (value: AppTheme) => Promise<void>;
};

export function GeneralSettings({
  settings,
  saving,
  onUseGlobalPiConfigChange,
  onThemeChange,
}: GeneralSettingsProps) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { status: updateStatus, errorMessage, checkForUpdates } = useAppUpdate();

  useEffect(() => {
    void window.harness.getAppVersion().then(setAppVersion);
  }, []);

  const updateStatusMessage = (() => {
    switch (updateStatus) {
      case "checking":
        return "Checking for updates…";
      case "available":
        return "Update found. Downloading…";
      case "downloading":
        return "Downloading update…";
      case "downloaded":
        return "Update ready. Use the Install button in the title bar.";
      case "not-available":
        return "You're on the latest version.";
      case "error":
        return errorMessage ?? "Update check failed.";
      default:
        return null;
    }
  })();

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await importSessionsFromGlobalPi();
      setImportStatus(
        `Imported ${result.conversations} conversation(s) from ${result.projects} project(s).`,
      );
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, []);

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">General</h2>

      <section className="settings-group">
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">Appearance</div>
            <p className="settings-row-description">
              Choose light mode, dark mode, or follow your system preference.
            </p>
          </div>
          <div className="settings-segmented" role="radiogroup" aria-label="Appearance">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                className={`settings-segmented-button ${
                  settings.theme === theme ? "settings-segmented-button-active" : ""
                }`}
                disabled={saving}
                onClick={() => void onThemeChange(theme)}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">Use global Pi configuration</div>
            <p className="settings-row-description">
              When enabled, OpenHarness reads and writes <code>~/.pi/agent</code> (same as the
              terminal <code>pi</code> CLI). When off, it uses a separate profile under app data.
            </p>
          </div>
          <SettingsToggle
            label="Use global Pi configuration"
            checked={settings.useGlobalPiConfig}
            disabled={saving}
            onChange={(value) => void onUseGlobalPiConfigChange(value)}
          />
        </div>

        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">Pi config directory</div>
            <p className="settings-path">{settings.piAgentDir}</p>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">Import sessions from global Pi</div>
            <p className="settings-row-description">
              Copy conversation summaries from <code>~/.pi/agent/sessions</code> into OpenHarness.
              Message bodies stay in the original session files.
            </p>
          </div>
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={importing || saving}
            onClick={() => void handleImport()}
          >
            {importing ? "Importing…" : "Import sessions"}
          </button>
          {importStatus ? <p className="settings-status">{importStatus}</p> : null}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">App updates</div>
            <p className="settings-row-description">
              OpenHarness checks for updates on launch. Version{" "}
              {appVersion ? <code>{appVersion}</code> : "…"}
            </p>
          </div>
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={saving || updateStatus === "checking"}
            onClick={() => void checkForUpdates()}
          >
            {updateStatus === "checking" ? "Checking…" : "Check for updates"}
          </button>
          {updateStatusMessage ? (
            <p
              className={`settings-status${
                updateStatus === "error" ? " settings-status-error" : ""
              }`}
            >
              {updateStatusMessage}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
