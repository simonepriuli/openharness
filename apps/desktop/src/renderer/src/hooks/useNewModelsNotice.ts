import { useCallback, useEffect, useState } from "react";
import type { HarnessModelInfo } from "../../../preload/api";

type NewModelsNoticeState = {
  version: string;
  models: HarnessModelInfo[];
};

export function useNewModelsNotice() {
  const [notice, setNotice] = useState<NewModelsNoticeState | null>(null);

  useEffect(() => {
    return window.harness.onNewModelsAvailable((payload) => {
      setNotice({
        version: payload.version,
        models: payload.models,
      });
    });
  }, []);

  const dismiss = useCallback(() => {
    if (!notice) return;
    void window.harness.dismissNewModelsNotice({ version: notice.version });
    setNotice(null);
  }, [notice]);

  return {
    notice,
    dismiss,
  };
}
