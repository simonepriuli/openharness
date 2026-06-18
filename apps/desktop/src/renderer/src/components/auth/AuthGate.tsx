import { useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../../auth";
import { LoginView } from "./LoginView";

interface AuthGateProps {
  children: ReactNode;
}

const SESSION_CHECK_TIMEOUT_MS = 2500;

function hasAuthBridge(): boolean {
  return typeof window.getUser === "function" && typeof window.requestAuth === "function";
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!hasAuthBridge()) {
      setCheckingSession(false);
      setError("Sign-in is unavailable. Restart the app.");
      return;
    }

    const stopChecking = window.setTimeout(() => {
      if (!cancelled) {
        setCheckingSession(false);
      }
    }, SESSION_CHECK_TIMEOUT_MS);

    void window
      .getUser()
      .then((sessionUser) => {
        if (!cancelled) {
          setUser(sessionUser);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        window.clearTimeout(stopChecking);
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    const unsubscribeAuthenticated = window.onAuthenticated((sessionUser) => {
      setUser(sessionUser);
      setLoginLoading(false);
      setCheckingSession(false);
      setError(null);
    });

    const unsubscribeUserUpdated = window.onUserUpdated((sessionUser) => {
      setUser(sessionUser);
    });

    const unsubscribeAuthError = window.onAuthError((ctx) => {
      setLoginLoading(false);
      setCheckingSession(false);
      setError(ctx.message ?? "Authentication failed. Is the API running?");
    });

    return () => {
      cancelled = true;
      window.clearTimeout(stopChecking);
      unsubscribeAuthenticated();
      unsubscribeUserUpdated();
      unsubscribeAuthError();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (user) {
      if (window.harness.nativeVibrancyEnabled) {
        root.classList.add("electron-mac-vibrancy");
      }
      return;
    }

    root.classList.remove("electron-mac-vibrancy");
    return () => {
      if (window.harness.nativeVibrancyEnabled) {
        root.classList.add("electron-mac-vibrancy");
      }
    };
  }, [user]);

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <LoginView
        checking={checkingSession}
        error={error}
        loading={loginLoading}
        onLogin={() => {
          if (!hasAuthBridge()) {
            setError("Sign-in is unavailable. Restart the app.");
            return;
          }

          setError(null);
          setLoginLoading(true);
          void window.harness
            .requestElectronAuth()
            .catch((err: unknown) => {
              setLoginLoading(false);
              setError(err instanceof Error ? err.message : "Failed to start sign in.");
            });
        }}
      />
    </div>
  );
}
