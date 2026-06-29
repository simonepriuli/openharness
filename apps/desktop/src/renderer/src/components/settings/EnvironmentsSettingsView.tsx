import { useState } from "react";
import type { RepoEnvironmentSummary } from "../../../../preload/api";
import {
  SourceControlProviderIcon,
  sourceControlProviderLabel,
} from "../icons/SourceControlProviderIcon";
import { useRepoEnvironmentsQuery } from "../../queries/use-repo-environments";
import { RepoEnvironmentDetailView } from "../environments/RepoEnvironmentDetailView";

export function EnvironmentsSettingsView() {
  const reposQuery = useRepoEnvironmentsQuery();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const repos = reposQuery.data?.repos ?? [];
  const selectedRepo =
    repos.find((repo) => repo.connectionId === selectedConnectionId) ?? null;

  if (selectedRepo) {
    return (
      <div className="settings-panel">
        <RepoEnvironmentDetailView
          repo={selectedRepo}
          onBack={() => setSelectedConnectionId(null)}
        />
      </div>
    );
  }

  const loading = reposQuery.isPending && !reposQuery.data;
  const error = reposQuery.error instanceof Error ? reposQuery.error.message : null;

  return (
    <div className="settings-panel">
      <div className="environments-list">
        <header className="environments-list-header">
          <h2 className="settings-panel-title">Environments</h2>
          <p className="settings-muted settings-section-lead">
            Per-repository variables for Cloud Workers. Plain values are visible to org members;
            secrets are masked after save. Model API keys live under Organization → Secrets.
          </p>
        </header>

        {loading ? <p className="settings-muted">Loading repositories…</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}

        {!loading && !error && repos.length === 0 ? (
          <p className="settings-muted workflow-list-empty">
            No linked repositories yet. Connect a repository from a project or from Organization
            settings, then return here to configure variables.
          </p>
        ) : null}

        {!loading && !error && repos.length > 0 ? (
          <div className="workflow-history-table-wrap">
            <table className="workflow-history-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th className="environments-provider-col">Provider</th>
                  <th>Variables</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((repo: RepoEnvironmentSummary) => (
                  <tr
                    key={repo.connectionId}
                    onClick={() => setSelectedConnectionId(repo.connectionId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedConnectionId(repo.connectionId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td>{repo.fullName}</td>
                    <td className="environments-provider-col">
                      <span
                        className="workflow-list-type-icon"
                        title={sourceControlProviderLabel(repo.provider)}
                        aria-label={sourceControlProviderLabel(repo.provider)}
                      >
                        <SourceControlProviderIcon provider={repo.provider} />
                      </span>
                    </td>
                    <td>{repo.variableCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
