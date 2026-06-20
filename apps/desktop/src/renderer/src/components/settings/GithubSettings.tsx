import { useCallback, useEffect, useState } from "react";
import type { GithubStatus, SessionDiagnostics } from "../../../../preload/api";
import { useAuthUser } from "../../hooks/useAuthUser";
import { SettingsCard } from "./SettingsCard";

const GITHUB_APP_DOCS = "https://docs.github.com/en/apps/using-github-apps/about-using-github-apps";

type GithubSettingsProps = {
  onInstallStarted?: () => void;
};

export function GithubSettings({ onInstallStarted }: GithubSettingsProps) {
  const { user, loading: userLoading } = useAuthUser();
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SessionDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.harness.getGithubStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub status");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSignOutAndIn = useCallback(async () => {
    setSigningOut(true);
    setError(null);
    try {
      if (typeof window.signOut === "function") {
        await window.signOut();
      }
      if (typeof window.requestAuth === "function") {
        await window.requestAuth();
      } else {
        await window.harness.requestElectronAuth();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start sign in");
    } finally {
      setSigningOut(false);
    }
  }, []);

  const handleRunDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      const next = await window.harness.getSessionDiagnostics();
      setDiagnostics(next);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const handleInstall = async () => {
    setOpening(true);
    setError(null);
    try {
      await window.harness.openGithubInstall();
      onInstallStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open GitHub install page");
    } finally {
      setOpening(false);
    }
  };

  if ((loading && !status) || userLoading) {
    return <p className="settings-muted">Loading integrations…</p>;
  }

  const connected = status?.agentReady ?? false;
  const configured = status?.configured ?? false;
  const statusError = status?.error ?? null;
  const signedIn = Boolean(user);
  const looksUnauthorized =
    statusError === "Unauthorized" ||
    statusError === "Not signed in" ||
    error === "Unauthorized" ||
    error === "Not signed in";
  const showDiagnostics = looksUnauthorized || Boolean(statusError || error);

  return (
    <SettingsCard padded={false}>
      <div className="settings-row settings-row-static">
        <div className="settings-row-text">
          <div className="settings-row-label">GitHub</div>
          <p className="settings-row-description">
            {connected
              ? "OpenHarness can access repositories where the GitHub App is installed. Agent actions on pull requests appear as the OpenHarness bot."
              : "Install the OpenHarness GitHub App on repositories you want agents to access. Bot approvals may not satisfy branch protection rules that require human reviewers."}{" "}
            <a
              className="settings-link settings-link-inline"
              href={GITHUB_APP_DOCS}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </p>

          {connected && status?.installations?.length ? (
            <div className="settings-row-feedback">
              {status.installations.map((installation) => (
                <p key={installation.installationId} className="settings-muted">
                  {installation.accountLogin} · {installation.accountType} ·{" "}
                  {installation.repoCount} repo
                  {installation.repoCount === 1 ? "" : "s"} · {installation.repositorySelection}
                </p>
              ))}
            </div>
          ) : null}

          {!configured && !statusError ? (
            <p className="settings-muted settings-row-feedback">
              GitHub App is not configured on the API server yet.
            </p>
          ) : null}

          {statusError || error ? (
            <p className="settings-error settings-row-feedback">
              {looksUnauthorized
                ? "The API server did not accept your session. Re-authenticating may help."
                : (statusError ?? error)}
            </p>
          ) : null}

          {!signedIn ? (
            <p className="settings-muted settings-row-feedback">Sign in to OpenHarness to connect GitHub.</p>
          ) : null}

          {showDiagnostics ? (
            <div className="settings-button-row settings-row-feedback">
              <button
                type="button"
                className="settings-button settings-button-secondary"
                disabled={diagnosticsLoading}
                onClick={() => void handleRunDiagnostics()}
              >
                {diagnosticsLoading ? "Running…" : "Run diagnostics"}
              </button>
            </div>
          ) : null}

          {diagnostics ? (
            <pre
              className="settings-row-feedback"
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(0,0,0,0.04)",
              }}
            >
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          ) : null}
        </div>

        {looksUnauthorized ? (
          <button
            type="button"
            className="settings-button settings-button-secondary settings-action-button"
            disabled={signingOut}
            onClick={() => void handleSignOutAndIn()}
          >
            {signingOut ? "Signing out…" : "Sign in again"}
          </button>
        ) : (
          <button
            type="button"
            className="settings-button settings-button-secondary settings-action-button"
            disabled={!configured || opening || !signedIn}
            onClick={() => void handleInstall()}
          >
            {opening ? "Opening GitHub…" : connected ? "Manage" : "Connect"}
          </button>
        )}
      </div>
    </SettingsCard>
  );
}
