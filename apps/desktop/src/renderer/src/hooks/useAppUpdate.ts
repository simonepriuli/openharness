import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "../../../preload/api";

export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });

  useEffect(() => {
    return window.harness.onUpdateStatus((next) => {
      setStatus(next);
    });
  }, []);

  const checkForUpdates = useCallback(async () => {
    setStatus({ status: "checking" });
    try {
      await window.harness.checkForUpdates();
    } catch (err) {
      setStatus({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to check for updates",
      });
    }
  }, []);

  const install = useCallback(() => {
    void window.harness.installUpdate();
  }, []);

  const version =
    status.status === "available" ||
    status.status === "downloading" ||
    status.status === "downloaded"
      ? status.version
      : null;

  const progress = status.status === "downloading" ? status.progress : null;

  return {
    status: status.status,
    version,
    progress,
    errorMessage: status.status === "error" ? status.message : null,
    checkForUpdates,
    install,
  };
}
