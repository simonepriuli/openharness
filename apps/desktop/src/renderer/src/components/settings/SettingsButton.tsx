import type { ButtonHTMLAttributes, ReactNode } from "react";

type SettingsButtonVariant = "secondary" | "ghost" | "destructive" | "primary" | "save";
type SettingsButtonSize = "default" | "sm";

type SettingsButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: SettingsButtonVariant;
  size?: SettingsButtonSize;
  type?: "button" | "submit" | "reset";
  children: ReactNode;
};

const VARIANT_CLASS: Record<SettingsButtonVariant, string> = {
  secondary: "settings-button-secondary",
  ghost: "settings-button-ghost",
  destructive: "settings-button-ghost settings-button-destructive",
  primary: "settings-button-primary",
  save: "settings-button-save",
};

export function SettingsButton({
  variant = "secondary",
  size,
  className,
  type = "button",
  children,
  ...props
}: SettingsButtonProps) {
  const resolvedSize = size ?? (variant === "destructive" ? "sm" : "default");
  const classes = [
    "settings-button",
    VARIANT_CLASS[variant],
    resolvedSize === "sm" ? "settings-button-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
