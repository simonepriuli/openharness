import { useCallback, useEffect, useState } from "react";
import type { GithubStatus } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";

const GITHUB_APP_DOCS = "https://docs.github.com/en/apps/using-github-apps/about-using-github-apps";

type GithubSettingsProps = {
  onInstallStarted?: () => void;
};

export function GithubSettings({ onInstallStarted }: GithubSettingsProps) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading && !status) {
    return <p className="settings-muted">Loading GitHub settings…</p>;
  }

  const agentReady = status?.agentReady ?? false;
  const configured = status?.configured ?? false;
  const statusError = status?.error ?? null;

  return (
    <>
      <SettingsCard title="Setup steps" padded={false}>
        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">1. Sign in with GitHub</div>
            <p className="settings-row-description">Required to use OpenHarness.</p>
          </div>
          <span className="settings-status">Complete</span>
        </div>
        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">2. Install GitHub App</div>
            <p className="settings-row-description">
              Grant the OpenHarness GitHub App access to selected repositories. Agent actions on
              pull requests appear as the OpenHarness bot.
            </p>
          </div>
          <span className={agentReady ? "settings-status" : "settings-muted"}>
            {agentReady ? "Complete" : "Pending"}
          </span>
        </div>
      </SettingsCard>

      <SettingsCard title="GitHub App" className="settings-api-section">
        <p className="settings-api-description">
          Install the OpenHarness GitHub App on the repositories you want agents to access. Bot
          approvals may not satisfy branch protection rules that require human reviewers.{" "}
          <a
            className="settings-link settings-link-inline"
            href={GITHUB_APP_DOCS}
            target="_blank"
            rel="noreferrer"
          >
            Learn more
          </a>
        </p>

        {!configured && !statusError ? (
          <p className="settings-muted settings-api-feedback">
            GitHub App is not configured on the API server yet. Check Vercel env vars:
            GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_WEBHOOK_SECRET, GITHUB_APP_PRIVATE_KEY.
          </p>
        ) : null}

        {statusError || error ? (
          <p className="settings-error settings-api-feedback">
            {statusError === "Unauthorized" ||
            statusError === "Not signed in" ||
            error === "Unauthorized" ||
            error === "Not signed in"
              ? "Your session expired or is invalid. Sign out and sign in again, then refresh."
              : (statusError ?? error)}
          </p>
        ) : null}

        <div className="settings-api-actions">
          <button
            type="button"
            className="settings-button settings-button-primary"
            disabled={!configured || opening}
            onClick={() => void handleInstall()}
          >
            {opening
              ? "Opening GitHub…"
              : agentReady
                ? "Manage GitHub App installation"
                : "Install GitHub App"}
          </button>
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh status
          </button>
        </div>
      </SettingsCard>

      {status?.installations?.length ? (
        <SettingsCard title="Installations" padded={false}>
          {status.installations.map((installation) => (
            <div key={installation.installationId} className="settings-row settings-row-static">
              <div className="settings-row-text">
                <div className="settings-row-label">{installation.accountLogin}</div>
                <p className="settings-row-description">
                  {installation.accountType} · {installation.repoCount} repo
                  {installation.repoCount === 1 ? "" : "s"} · {installation.repositorySelection}
                </p>
              </div>
            </div>
          ))}
        </SettingsCard>
      ) : null}
    </>
  );
}
