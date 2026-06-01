type SettingsToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
};

export function SettingsToggle({ checked, onChange, disabled, label }: SettingsToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-toggle ${checked ? "settings-toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}
