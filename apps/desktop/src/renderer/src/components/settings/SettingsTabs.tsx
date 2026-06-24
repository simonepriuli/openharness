import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

export type SettingsTabItem<T extends string> = {
  id: T;
  label: string;
  hidden?: boolean;
  icon?: IconSvgElement;
};

type SettingsTabsProps<T extends string> = {
  items: readonly SettingsTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "pill" | "segmented";
  ariaLabel?: string;
  className?: string;
};

export function SettingsTabs<T extends string>({
  items,
  value,
  onChange,
  variant = "pill",
  ariaLabel,
  className,
}: SettingsTabsProps<T>) {
  const visibleItems = items.filter((item) => !item.hidden);

  return (
    <div
      className={`settings-tabs settings-tabs-${variant}${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {visibleItems.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={`settings-tabs-tab${value === item.id ? " settings-tabs-tab-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.icon ? (
            <HugeiconsIcon
              icon={item.icon}
              size={14}
              strokeWidth={1.75}
              className="settings-tabs-tab-icon"
              aria-hidden
            />
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}
