import type { ReactNode } from "react";
import { DocumentAttachmentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AppTheme, AppWorkMode, HarnessSettings } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";
import { UpdatesSettings } from "./UpdatesSettings";

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

const CodingModeIcon = () => (
  <svg {...iconProps}>
    <path d="M8 9l-4 3 4 3" />
    <path d="M16 9l4 3-4 3" />
    <path d="M13 6l-2 12" />
  </svg>
);

const WORK_MODE_OPTIONS: ReadonlyArray<{
  value: AppWorkMode;
  label: string;
  description: string;
}> = [
  {
    value: "coding",
    label: "For coding",
    description: "Software development and technical problem-solving",
  },
  {
    value: "everyday",
    label: "For everyday work",
    description: "Writing, research, planning, and day-to-day work",
  },
];

const THEME_OPTIONS: ReadonlyArray<{ value: AppTheme; label: string; icon: ReactNode }> = [
  { value: "system", label: "System", icon: <SystemIcon /> },
  { value: "light", label: "Light", icon: <LightIcon /> },
  { value: "dark", label: "Dark", icon: <DarkIcon /> },
];

type GeneralSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  onThemeChange: (value: AppTheme) => Promise<void>;
  onWorkModeChange: (value: AppWorkMode) => Promise<void>;
};

export function GeneralSettings({
  settings,
  saving,
  onThemeChange,
  onWorkModeChange,
}: GeneralSettingsProps) {
  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">General</h2>

      <SettingsCard title="Work mode">
        <div className="settings-mode-options" role="radiogroup" aria-label="Work mode">
          {WORK_MODE_OPTIONS.map(({ value, label, description }) => {
            const active = settings.workMode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`settings-mode-option${active ? " settings-mode-option-active" : ""}`}
                disabled={saving}
                onClick={() => {
                  if (settings.workMode === value) return;
                  void onWorkModeChange(value);
                }}
              >
                <span className="settings-mode-option-icon" aria-hidden>
                  {value === "coding" ? (
                    <CodingModeIcon />
                  ) : (
                    <HugeiconsIcon icon={DocumentAttachmentIcon} size={15} strokeWidth={1.7} />
                  )}
                </span>
                <span className="settings-mode-option-text">
                  <span className="settings-mode-option-label">{label}</span>
                  <span className="settings-mode-option-description">{description}</span>
                </span>
                <span
                  className={`settings-mode-option-radio${active ? " settings-mode-option-radio-active" : ""}`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </SettingsCard>

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

      <UpdatesSettings />
    </div>
  );
}
