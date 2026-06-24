import { useEffect, useState } from "react";
import { useAuthUser } from "../../hooks/useAuthUser";
import {
  useAzureDevOpsStatusQuery,
  useConnectAzureDevOpsMutation,
  useDisconnectAzureDevOpsMutation,
} from "../../queries/use-azure-devops";
import { AzureDevOpsIcon } from "../icons/AzureDevOpsIcon";
import { SettingsCard } from "./SettingsCard";

export function AzureDevOpsSettings() {
  const { user } = useAuthUser();
  const [orgName, setOrgName] = useState("");
  const [pat, setPat] = useState("");
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useAzureDevOpsStatusQuery();
  const connectAzureDevOps = useConnectAzureDevOpsMutation();
  const disconnectAzureDevOps = useDisconnectAzureDevOpsMutation();

  const status = statusQuery.data ?? null;
  const saving = connectAzureDevOps.isPending || disconnectAzureDevOps.isPending;

  useEffect(() => {
    if (status?.connection?.displayName) {
      setOrgName(status.connection.displayName);
    }
  }, [status?.connection?.displayName]);

  const handleConnect = async () => {
    if (!orgName.trim() || !pat.trim()) {
      setError("Organization name and PAT are required");
      return;
    }

    setError(null);
    try {
      await connectAzureDevOps.mutateAsync({ orgName: orgName.trim(), pat: pat.trim() });
      setPat("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Azure DevOps");
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnectAzureDevOps.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Azure DevOps");
    }
  };

  if (statusQuery.isPending && !status) {
    return <p className="settings-muted">Loading integrations…</p>;
  }

  const connected = status?.connected ?? false;
  const agentReady = status?.agentReady ?? false;
  const signedIn = Boolean(user);
  const statusError =
    error ??
    (statusQuery.error instanceof Error ? statusQuery.error.message : null) ??
    status?.error ??
    null;

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
