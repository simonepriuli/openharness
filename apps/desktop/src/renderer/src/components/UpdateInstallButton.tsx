import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppUpdate } from "../hooks/useAppUpdate";

export function UpdateInstallButton() {
  const { status, version, progress, install } = useAppUpdate();

  if (status === "downloaded") {
    const label = version ? `Install v${version}` : "Install update";
    return (
      <button
        type="button"
        className="update-install-button"
        onClick={install}
        title={label}
      >
        <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.75} aria-hidden />
        <span>{label}</span>
      </button>
    );
  }

  if (status === "downloading") {
    const percent = progress != null ? Math.round(progress) : null;
    return (
      <div className="update-download-indicator" title="Downloading update…">
        <span className="update-download-indicator-spinner" aria-hidden />
        <span>{percent != null ? `Updating ${percent}%` : "Updating…"}</span>
      </div>
    );
  }

  return null;
}
