import { useEffect, useState } from "react";
import type { AuthApiStatus } from "../../../../preload/api";

interface LoginViewProps {
  checking: boolean;
  loading: boolean;
  error: string | null;
  onLogin: () => void;
}

export function LoginView({ checking, loading, error, onLogin }: LoginViewProps) {
  const [apiStatus, setApiStatus] = useState<AuthApiStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      void window.harness.getAuthApiStatus().then((status) => {
        if (!cancelled) {
          setApiStatus(status);
        }
      });
    };

    refresh();
    const intervalId = window.setInterval(refresh, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const busy = checking || loading;
  const label = checking ? "Checking session…" : loading ? "Opening browser…" : "Login with GitHub";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <button
        type="button"
        className="app-region-no-drag inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        disabled={busy}
        onClick={onLogin}
      >
        {label}
      </button>

      {apiStatus ? (
        <p
          className={`app-region-no-drag mt-4 max-w-sm text-center text-xs ${
            apiStatus.reachable
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-300"
          }`}
        >
          {apiStatus.reachable
            ? `API connected at ${apiStatus.apiUrl}`
            : `Can't reach API at ${apiStatus.apiUrl}. Check that pnpm dev:api is running on that URL.`}
        </p>
      ) : null}

      {error ? (
        <p className="app-region-no-drag mt-3 max-w-sm text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
