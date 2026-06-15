import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "../../../preload/api";

export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    void window.harness.getUpdateStatus().then((current) => {
      if (!cancelled) {
        setStatus(current);
      }
    });

    return window.harness.onUpdateStatus((next) => {
      setStatus(next);
    });
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

  return {
    status: status.status,
    version,
    install,
  };
}
