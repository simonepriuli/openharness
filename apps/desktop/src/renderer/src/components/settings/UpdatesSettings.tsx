import { useCallback, useState } from "react";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { SettingsCard } from "./SettingsCard";

export function UpdatesSettings() {
  const {
    status,
    version: availableVersion,
    appVersion,
    updaterEnabled,
    downloadProgress,
    errorMessage,
    check,
    install,
  } = useAppUpdate();
  const [installing, setInstalling] = useState(false);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    install();
  }, [install]);

  if (updaterEnabled === false) {
    return null;
  }

  if (updaterEnabled === null || appVersion === null) {
    return (
      <SettingsCard title="Updates" padded={false}>
        <div className="settings-row settings-row-static">
          <p className="settings-muted">Loading…</p>
        </div>
      </SettingsCard>
    );
  }

  const hasUpdate =
    status === "available" || status === "downloading" || status === "downloaded";
  const showProgress = status === "available" || status === "downloading";
  const checkDisabled =
    status === "checking" ||
    status === "downloading" ||
    status === "downloaded" ||
    installing;
  const updateDisabled = status !== "downloaded" || installing;

  return (
    <SettingsCard title="Updates" padded={false}>
      <div className="settings-row settings-row-stack">
        <div className="settings-row-text">
          <div className="settings-row-label">v{appVersion}</div>
          {hasUpdate && availableVersion ? (
            <p className="settings-row-description">v{availableVersion} available</p>
          ) : null}
          {status === "checking" ? <p className="settings-muted">Checking…</p> : null}
          {status === "not-available" ? <p className="settings-muted">Up to date</p> : null}
          {errorMessage ? <p className="settings-error">{errorMessage}</p> : null}
        </div>

        {showProgress && downloadProgress !== null ? (
          <div className="settings-update-progress">
            <div className="settings-progress-track">
              <div
                className="settings-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span className="settings-progress-label">
              {status === "downloading"
                ? `${Math.round(downloadProgress)}%`
                : "Preparing download…"}
            </span>
          </div>
        ) : null}

        <div className="settings-button-row">
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={checkDisabled}
            onClick={() => check()}
          >
            Check for updates
          </button>
          {hasUpdate ? (
            <button
              type="button"
              className="settings-button settings-button-primary"
              disabled={updateDisabled}
              onClick={() => handleInstall()}
            >
              {installing ? "Installing…" : "Update"}
            </button>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  );
}
