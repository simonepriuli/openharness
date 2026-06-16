import type { ReactNode } from "react";

type SettingsCardProps = {
  children: ReactNode;
  /** Optional section title rendered above (outside) the card. */
  title?: string;
  padded?: boolean;
  overflowVisible?: boolean;
  className?: string;
};

export function SettingsCard({
  children,
  title,
  padded = true,
  overflowVisible = false,
  className,
}: SettingsCardProps) {
  const classes = [
    "settings-group",
    padded ? "settings-card-padded" : null,
    overflowVisible ? "settings-group-overflow-visible" : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  const card = <section className={classes}>{children}</section>;

  if (!title) return card;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {card}
    </div>
  );
}
