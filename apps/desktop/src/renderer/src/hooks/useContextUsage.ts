import { useCallback, useEffect, useState } from "react";
import type { ContextUsage, SessionStats } from "../../../preload/api";

const DEFAULT_CONTEXT_WINDOW = 200_000;

const UNKNOWN_CONTEXT_USAGE: ContextUsage = {
  tokens: null,
  percent: null,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
};

function readContextWindow(model: unknown): number | undefined {
  if (!model || typeof model !== "object") return undefined;
  const record = model as Record<string, unknown>;
  for (const key of ["contextWindow", "context_window", "maxTokens", "max_tokens"]) {
    const value = record[key];
    if (typeof value === "number" && value > 0) return value;
  }
  return undefined;
}

function resolveContextUsage(
  stats: SessionStats | null,
  contextWindow: number,
): ContextUsage {
  const usage: ContextUsage = stats?.contextUsage
    ? { ...stats.contextUsage, contextWindow }
    : {
        tokens: null,
        percent: null,
        contextWindow,
      };

  if (stats?.tokens) {
    usage.tokenStats = stats.tokens;
  }

  if (stats?.cost != null) {
    usage.cost = stats.cost;
  }

  return usage;
}

export function useContextUsage(
  enabled: boolean,
  sessionKey: string | null,
  refreshKey = 0,
): ContextUsage | null {
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionKey) return;

    let contextWindow = DEFAULT_CONTEXT_WINDOW;
    try {
      const state = await window.harness.getState({ sessionKey });
      contextWindow = readContextWindow(state?.model) ?? DEFAULT_CONTEXT_WINDOW;
    } catch {
      // Keep default context window when state is unavailable.
    }

    try {
      const stats = await window.harness.getSessionStats({ sessionKey });
      setUsage(resolveContextUsage(stats, contextWindow));
    } catch {
      setUsage((prev) => prev ?? { ...UNKNOWN_CONTEXT_USAGE, contextWindow });
    }
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled || !sessionKey) {
      setUsage(null);
      return;
    }

    setUsage(UNKNOWN_CONTEXT_USAGE);
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [enabled, sessionKey, refresh]);

  useEffect(() => {
    if (!enabled || !sessionKey) return;
    void refresh();
  }, [enabled, sessionKey, refresh, refreshKey]);

  return usage;
}
