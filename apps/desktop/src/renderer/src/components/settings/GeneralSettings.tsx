import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { AppTheme, HarnessSettings } from "../../../../preload/api";
import { importSessionsFromGlobalPi } from "../../lib/chat-storage";
import { SettingsCard } from "./SettingsCard";
import { SettingsToggle } from "./SettingsToggle";

const iconProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const SystemIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const LightIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const DarkIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const THEME_OPTIONS: ReadonlyArray<{ value: AppTheme; label: string; icon: ReactNode }> = [
  { value: "system", label: "System", icon: <SystemIcon /> },
  { value: "light", label: "Light", icon: <LightIcon /> },
  { value: "dark", label: "Dark", icon: <DarkIcon /> },
];

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

      <SettingsCard title="Appearance" padded={false}>
        <div className="settings-row">
          <div className="settings-row-text">
            <p className="settings-row-description">
              Choose light mode, dark mode, or follow your system preference.
            </p>
          </div>
          <div className="settings-segmented" role="radiogroup" aria-label="Appearance">
            {THEME_OPTIONS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={settings.theme === value}
                className={`settings-segmented-button ${
                  settings.theme === value ? "settings-segmented-button-active" : ""
                }`}
                disabled={saving}
                onClick={() => void onThemeChange(value)}
              >
                <span className="settings-segmented-icon" aria-hidden>
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Pi configuration" padded={false}>
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
      </SettingsCard>

      <SettingsCard title="Import sessions from global Pi" padded={false}>
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
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
      </SettingsCard>
    </div>
  );
}
