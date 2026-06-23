import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../hooks/useAuthUser";
import { remoteKeys } from "../../queries/query-keys";
import { AzureDevOpsIcon } from "../icons/AzureDevOpsIcon";
import { SettingsCard } from "./SettingsCard";

type AzureDevOpsStatus = {
  configured: boolean;
  connected: boolean;
  agentReady: boolean;
  connection: {
    connectionId: string;
    displayName: string;
    externalOrgId: string;
    repoCount: number;
  } | null;
  error?: string;
};

export function AzureDevOpsSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [orgName, setOrgName] = useState("");
  const [pat, setPat] = useState("");
  const [status, setStatus] = useState<AzureDevOpsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.harness.getAzureDevOpsStatus();
      setStatus(next);
      if (next.connection?.displayName) {
        setOrgName(next.connection.displayName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Azure DevOps status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleConnect = async () => {
    if (!orgName.trim() || !pat.trim()) {
      setError("Organization name and PAT are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await window.harness.connectAzureDevOps({ orgName: orgName.trim(), pat: pat.trim() });
      setPat("");
      await refreshStatus();
      void queryClient.invalidateQueries({ queryKey: remoteKeys.azureDevOps.status() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Azure DevOps");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.harness.disconnectAzureDevOps();
      await refreshStatus();
      void queryClient.invalidateQueries({ queryKey: remoteKeys.azureDevOps.status() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Azure DevOps");
    } finally {
      setSaving(false);
    }
  };

  if (loading || userLoading) {
    return <p className="settings-muted">Loading integrations…</p>;
  }

  const connected = status?.connected ?? false;
  const agentReady = status?.agentReady ?? false;
  const signedIn = Boolean(user);
  const statusError = error ?? status?.error ?? null;

  const actionButtons = connected ? (
    <div className="settings-button-row">
      <button
        type="button"
        className="settings-button settings-button-secondary settings-action-button"
        disabled={!signedIn || saving || !pat.trim()}
        onClick={() => void handleConnect()}
      >
        {saving ? "Updating…" : "Update PAT"}
      </button>
      <button
        type="button"
        className="settings-button settings-button-secondary settings-action-button"
        disabled={!signedIn || saving}
        onClick={() => void handleDisconnect()}
      >
        Disconnect
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="settings-button settings-button-secondary settings-action-button"
      disabled={!signedIn || saving || !orgName.trim() || !pat.trim()}
      onClick={() => void handleConnect()}
    >
      {saving ? "Connecting…" : "Connect"}
    </button>
  );

  return (
    <SettingsCard padded={false}>
      <div className="settings-integration-layout">
        <div className="settings-integration-header">
          <div className="settings-row-label settings-row-label-with-icon">
            <AzureDevOpsIcon size={16} />
            Azure DevOps
          </div>
          {actionButtons}
        </div>

        <div className="settings-row-text">
          <p className="settings-row-description">
            {connected
              ? "OpenHarness can access repositories in your Azure DevOps organization using the configured service account PAT. Workflow comments and approvals appear under that service account identity."
              : "Connect an Azure DevOps organization with a dedicated service account PAT. PR actions use that account's identity (not a separate bot). Required scopes: Code (read/write), Pull Request (read/write), Project (read), Service Hooks (read/write)."}
          </p>

          {connected && status?.connection ? (
            <p className="settings-muted settings-row-feedback">
              {status.connection.displayName} · {status.connection.repoCount} repo
              {status.connection.repoCount === 1 ? "" : "s"}
              {typeof (status.connection as { metadata?: { authenticatedUser?: string } }).metadata
                ?.authenticatedUser === "string"
                ? ` · PR actions as ${(status.connection as { metadata?: { authenticatedUser?: string } }).metadata!.authenticatedUser}`
                : ""}
            </p>
          ) : null}

          {!signedIn ? (
            <p className="settings-muted settings-row-feedback">Sign in to OpenHarness to connect Azure DevOps.</p>
          ) : null}

          {!signedIn && statusError ? (
            <p className="settings-error settings-row-feedback">{statusError}</p>
          ) : null}
        </div>

        {signedIn ? (
          <div className="settings-row-text">
            <div style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}>
              <label className="settings-muted">
                Organization
                <input
                  className="settings-input"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  placeholder="contoso"
                  disabled={!signedIn || saving}
                />
              </label>
              <label className="settings-muted">
                Personal access token
                <input
                  className="settings-input"
                  type="password"
                  value={pat}
                  onChange={(event) => setPat(event.target.value)}
                  placeholder={connected ? "Enter new PAT to rotate" : "PAT"}
                  disabled={!signedIn || saving}
                />
              </label>
            </div>

            {statusError ? <p className="settings-error settings-row-feedback">{statusError}</p> : null}
          </div>
        ) : null}

        {agentReady ? (
          <p className="settings-muted">Agent-ready: repositories are available for project linking and workflows.</p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
