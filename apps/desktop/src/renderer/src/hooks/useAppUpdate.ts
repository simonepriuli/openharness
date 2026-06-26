import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "../../../preload/api";

export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updaterEnabled, setUpdaterEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      window.harness.getUpdateStatus(),
      window.harness.getAppVersion(),
      window.harness.isUpdaterEnabled(),
    ]).then(([current, version, enabled]) => {
      if (!cancelled) {
        setStatus(current);
        setAppVersion(version);
        setUpdaterEnabled(enabled);
      }
    });

    return window.harness.onUpdateStatus((next) => {
      setStatus(next);
    });
  }, []);

  const install = useCallback(() => {
    void window.harness.installUpdate();
  }, []);

  const check = useCallback(() => {
    void window.harness.checkForUpdates();
  }, []);

  const availableVersion =
    status.status === "available" ||
    status.status === "downloading" ||
    status.status === "downloaded"
      ? status.version
      : null;

  const downloadProgress =
    status.status === "downloading"
      ? status.progress
      : status.status === "available"
        ? 0
        : null;

  const errorMessage = status.status === "error" ? status.message : null;

  return {
    status: status.status,
    version: availableVersion,
    install,
    check,
    appVersion,
    updaterEnabled,
    downloadProgress,
    errorMessage,
  };
}
