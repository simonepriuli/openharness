import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MsTeamsIcon } from "../icons/MsTeamsIcon";
import { useAuthUser } from "../../hooks/useAuthUser";
import { useGithubReposQuery } from "../../queries/use-github";
import {
  useDeleteTeamsMappingMutation,
  useOpenTeamsConnectMutation,
  useTeamsChannelsQuery,
  useTeamsForUserQuery,
  useTeamsMappingsQuery,
  useTeamsStatusQuery,
  useUpsertTeamsMappingMutation,
} from "../../queries/use-teams";
import { remoteKeys } from "../../queries/query-keys";
import { SettingsCard } from "./SettingsCard";

export function TeamsSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");

  const statusQuery = useTeamsStatusQuery();
  const teamsQuery = useTeamsForUserQuery();
  const mappingsQuery = useTeamsMappingsQuery();
  const reposQuery = useGithubReposQuery();
  const channelsQuery = useTeamsChannelsQuery(selectedTeamId || null);
  const openTeamsConnect = useOpenTeamsConnectMutation();
  const upsertMapping = useUpsertTeamsMappingMutation();
  const deleteMapping = useDeleteTeamsMappingMutation();

  const status = statusQuery.data ?? null;
  const teams = teamsQuery.data?.teams ?? [];
  const mappings = mappingsQuery.data?.mappings ?? status?.mappings ?? [];
  const repos = reposQuery.data?.repos ?? [];
  const channels = channelsQuery.data?.channels ?? [];

  const selectedTeam = useMemo(
    () => teams.find((team) => team.teamId === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const selectedRepoParts = useMemo(() => {
    const repo = repos.find((row) => row.fullName === selectedRepo);
    return repo ? { owner: repo.owner, repo: repo.name } : null;
  }, [repos, selectedRepo]);

  useEffect(() => {
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.teams() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.mappings() });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await openTeamsConnect.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Microsoft Teams connect page");
    }
  }, [openTeamsConnect]);

  const handleSaveMapping = useCallback(async () => {
    if (!selectedTeam || !selectedChannel || !selectedRepoParts) {
      setError("Select a team, channel, and GitHub repository.");
      return;
    }
    setError(null);
    try {
      await upsertMapping.mutateAsync({
        installationId: selectedTeam.installationId,
        teamId: selectedTeam.teamId,
        channelId: selectedChannel.id,
        channelName: selectedChannel.displayName,
        githubOwner: selectedRepoParts.owner,
        githubRepo: selectedRepoParts.repo,
      });
      setSelectedChannelId("");
      setSelectedRepo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channel mapping");
    }
  }, [selectedTeam, selectedChannel, selectedRepoParts, upsertMapping]);

  const handleDeleteMapping = useCallback(
    async (mappingId: string) => {
      setError(null);
      try {
        await deleteMapping.mutateAsync(mappingId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete mapping");
      }
    },
    [deleteMapping],
  );

  if ((statusQuery.isPending && !status) || userLoading) {
    return <p className="settings-muted">Loading Teams integration…</p>;
  }

  if (!user) {
    return <p className="settings-muted">Sign in to connect Microsoft Teams.</p>;
  }

  if (!status?.configured) {
    return (
      <SettingsCard
        title="Microsoft Teams"
        titleIcon={<MsTeamsIcon size={16} />}
      >
        <p className="settings-muted text-sm">
          Teams bot is not configured on the server. Ask your OpenHarness administrator to
          configure the Teams bot and Microsoft OAuth environment variables.
        </p>
      </SettingsCard>
    );
  }

  const connected = status.connected;

  return (
    <SettingsCard title="Microsoft Teams" titleIcon={<MsTeamsIcon size={16} />}>
      <p className="settings-muted text-sm workflow-github-actions-description">
        Connect Teams and map one channel per repository for workflow notifications and @mention
        triggers.
      </p>
      <div className="settings-github-actions">
        <button
          type="button"
          className="settings-primary-button"
          onClick={() => void handleConnect()}
          disabled={openTeamsConnect.isPending}
        >
          {connected ? "Reconnect Teams" : "Connect Teams"}
        </button>
      </div>

      {connected ? (
        <p className="settings-muted text-sm">
          Connected to {teams.length} team{teams.length === 1 ? "" : "s"}.
        </p>
      ) : (
        <p className="settings-muted text-sm">
          Connect your Microsoft account and install the OpenHarness bot into your Teams.
        </p>
      )}

      {mappings.length > 0 ? (
        <div className="workflow-detail-card" style={{ marginTop: "1rem" }}>
          <h3 className="workflow-detail-label">Channel mappings</h3>
          <ul className="settings-muted text-sm" style={{ listStyle: "none", padding: 0 }}>
            {mappings.map((mapping) => (
              <li
                key={mapping.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.5rem 0",
                }}
              >
                <span>
                  <strong>#{mapping.channelName}</strong> → {mapping.githubOwner}/{mapping.githubRepo}
                </span>
                <button
                  type="button"
                  className="settings-link-button"
                  onClick={() => void handleDeleteMapping(mapping.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {connected ? (
        <div className="workflow-detail-card" style={{ marginTop: "1rem" }}>
          <h3 className="workflow-detail-label">Add channel mapping</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            One channel per repository. Remapping replaces the previous channel for that repo.
          </p>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Team</span>
              <select
                className="settings-input"
                value={selectedTeamId}
                onChange={(event) => {
                  setSelectedTeamId(event.target.value);
                  setSelectedChannelId("");
                }}
              >
                <option value="">Select team…</option>
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>Channel</span>
              <select
                className="settings-input"
                value={selectedChannelId}
                onChange={(event) => setSelectedChannelId(event.target.value)}
                disabled={!selectedTeamId || channelsQuery.isPending}
              >
                <option value="">Select channel…</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>GitHub repository</span>
              <select
                className="settings-input"
                value={selectedRepo}
                onChange={(event) => setSelectedRepo(event.target.value)}
                disabled={reposQuery.isPending}
              >
                <option value="">Select repository…</option>
                {repos.map((repo) => (
                  <option key={repo.fullName} value={repo.fullName}>
                    {repo.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="settings-primary-button"
            style={{ marginTop: "0.75rem" }}
            onClick={() => void handleSaveMapping()}
            disabled={upsertMapping.isPending}
          >
            Save mapping
          </button>
        </div>
      ) : null}

      {error ? <p className="settings-error text-sm">{error}</p> : null}
    </SettingsCard>
  );
}
