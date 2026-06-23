import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiscordIcon } from "../icons/DiscordIcon";
import { useAuthUser } from "../../hooks/useAuthUser";
import { useGithubReposQuery } from "../../queries/use-github";
import { useAzureDevOpsReposQuery } from "../../queries/use-azure-devops";
import {
  useDeleteDiscordMappingMutation,
  useDiscordChannelsQuery,
  useDiscordGuildsQuery,
  useDiscordMappingsQuery,
  useDiscordStatusQuery,
  useOpenDiscordConnectMutation,
  useUpsertDiscordMappingMutation,
} from "../../queries/use-discord";
import { remoteKeys } from "../../queries/query-keys";
import { SettingsCard } from "./SettingsCard";

export function DiscordSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");

  const statusQuery = useDiscordStatusQuery();
  const guildsQuery = useDiscordGuildsQuery();
  const mappingsQuery = useDiscordMappingsQuery();
  const githubReposQuery = useGithubReposQuery();
  const adoReposQuery = useAzureDevOpsReposQuery();
  const channelsQuery = useDiscordChannelsQuery(selectedGuildId || null);
  const openDiscordConnect = useOpenDiscordConnectMutation();
  const upsertMapping = useUpsertDiscordMappingMutation();
  const deleteMapping = useDeleteDiscordMappingMutation();

  const status = statusQuery.data ?? null;
  const guilds = guildsQuery.data?.guilds ?? [];
  const mappings = mappingsQuery.data?.mappings ?? status?.mappings ?? [];
  const repos = useMemo(() => {
    const githubRepos = (githubReposQuery.data?.repos ?? []).map((repo) => ({
      ...repo,
      provider: "github" as const,
      key: `github:${repo.fullName}`,
    }));
    const adoRepos = (adoReposQuery.data?.repos ?? []).map((repo) => ({
      ...repo,
      provider: "azure_devops" as const,
      key: `azure_devops:${repo.fullName}`,
    }));
    return [...githubRepos, ...adoRepos].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [githubReposQuery.data?.repos, adoReposQuery.data?.repos]);
  const channels = channelsQuery.data?.channels ?? [];

  const selectedGuild = useMemo(
    () => guilds.find((guild) => guild.guildId === selectedGuildId) ?? null,
    [guilds, selectedGuildId],
  );

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const selectedRepoParts = useMemo(() => {
    const repo = repos.find((row) => row.key === selectedRepo);
    return repo ? { provider: repo.provider, owner: repo.owner, repo: repo.name } : null;
  }, [repos, selectedRepo]);

  useEffect(() => {
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.guilds() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.mappings() });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await openDiscordConnect.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Discord connect page");
    }
  }, [openDiscordConnect]);

  const handleSaveMapping = useCallback(async () => {
    if (!selectedGuild || !selectedChannel || !selectedRepoParts) {
      setError("Select a server, channel, and repository.");
      return;
    }
    setError(null);
    try {
      await upsertMapping.mutateAsync({
        installationId: selectedGuild.installationId,
        guildId: selectedGuild.guildId,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        provider: selectedRepoParts.provider,
        namespace: selectedRepoParts.owner,
        repoName: selectedRepoParts.repo,
        githubOwner: selectedRepoParts.owner,
        githubRepo: selectedRepoParts.repo,
      });
      setSelectedChannelId("");
      setSelectedRepo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channel mapping");
    }
  }, [selectedGuild, selectedChannel, selectedRepoParts, upsertMapping]);

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
    return <p className="settings-muted">Loading Discord integration...</p>;
  }
  if (!user) return <p className="settings-muted">Sign in to connect Discord.</p>;

  if (!status?.configured) {
    return (
      <SettingsCard title="Discord" titleIcon={<DiscordIcon size={16} />}>
        <p className="settings-muted text-sm">
          Discord integration is not configured on the server. Ask your OpenHarness administrator
          to configure the Discord OAuth and bot environment variables.
        </p>
      </SettingsCard>
    );
  }

  const connected = status.connected;

  return (
    <SettingsCard padded={false}>
      <div className="settings-row settings-row-static settings-row-static-top">
        <div className="settings-row-text">
          <div className="settings-row-label settings-row-label-with-icon">
            <DiscordIcon size={16} />
            Discord
          </div>
          <p className="settings-row-description">
            Connect Discord and map one channel per repository for workflow notifications and
            mention-driven triggers.
          </p>
        </div>
        <button
          type="button"
          className="settings-button settings-button-secondary settings-action-button"
          onClick={() => void handleConnect()}
          disabled={openDiscordConnect.isPending}
        >
          {openDiscordConnect.isPending ? "Opening Discord..." : connected ? "Reconnect" : "Connect"}
        </button>
      </div>

      {mappings.length > 0 ? (
        <div className="workflow-detail-card" style={{ marginTop: "1rem" }}>
          <h3 className="workflow-detail-label">Channel mappings</h3>
          <ul className="settings-muted text-sm" style={{ listStyle: "none", padding: 0 }}>
            {mappings.map((mapping) => (
              <li
                key={mapping.id}
                style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0" }}
              >
                <span>
                  <strong>{"#"}{mapping.channelName}</strong> {"->"} {mapping.namespace ?? mapping.githubOwner}/
                  {mapping.repoName ?? mapping.githubRepo}
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
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Server</span>
              <select
                className="settings-input"
                value={selectedGuildId}
                onChange={(event) => {
                  setSelectedGuildId(event.target.value);
                  setSelectedChannelId("");
                }}
              >
                <option value="">Select server...</option>
                {guilds.map((guild) => (
                  <option key={guild.guildId} value={guild.guildId}>
                    {guild.guildName}
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
                disabled={!selectedGuildId || channelsQuery.isPending}
              >
                <option value="">Select channel...</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>Repository</span>
              <select
                className="settings-input"
                value={selectedRepo}
                onChange={(event) => setSelectedRepo(event.target.value)}
                disabled={githubReposQuery.isPending || adoReposQuery.isPending}
              >
                <option value="">Select repository...</option>
                {repos.map((repo) => (
                  <option key={repo.key} value={repo.key}>
                    [{repo.provider === "azure_devops" ? "ADO" : "GitHub"}] {repo.fullName}
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
