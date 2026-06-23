import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiscordIcon } from "../icons/DiscordIcon";
import { useAuthUser } from "../../hooks/useAuthUser";
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
import {
  WorkflowRepoPicker,
  type IntegrationRepoSelection,
} from "./workflows/WorkflowRepoPicker";

export function DiscordSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<IntegrationRepoSelection | null>(null);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);

  const statusQuery = useDiscordStatusQuery();
  const guildsQuery = useDiscordGuildsQuery();
  const mappingsQuery = useDiscordMappingsQuery();
  const channelsQuery = useDiscordChannelsQuery(selectedGuildId || null);
  const openDiscordConnect = useOpenDiscordConnectMutation();
  const upsertMapping = useUpsertDiscordMappingMutation();
  const deleteMapping = useDeleteDiscordMappingMutation();

  const status = statusQuery.data ?? null;
  const guilds = guildsQuery.data?.guilds ?? [];
  const mappings = mappingsQuery.data?.mappings ?? status?.mappings ?? [];
  const channels = channelsQuery.data?.channels ?? [];

  const selectedGuild = useMemo(
    () => guilds.find((guild) => guild.guildId === selectedGuildId) ?? null,
    [guilds, selectedGuildId],
  );

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  useEffect(() => {
    if (guilds.length === 0) {
      setSelectedGuildId("");
      return;
    }
    if (!selectedGuildId || !guilds.some((guild) => guild.guildId === selectedGuildId)) {
      setSelectedGuildId(guilds[0]!.guildId);
    }
  }, [guilds, selectedGuildId]);

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
    if (!selectedGuild || !selectedChannel || !selectedRepo) {
      setError("Select a channel and repository.");
      return;
    }
    setError(null);
    try {
      await upsertMapping.mutateAsync({
        installationId: selectedGuild.installationId,
        guildId: selectedGuild.guildId,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        provider: selectedRepo.provider,
        namespace: selectedRepo.owner,
        repoName: selectedRepo.repo,
        githubOwner: selectedRepo.owner,
        githubRepo: selectedRepo.repo,
      });
      setSelectedChannelId("");
      setSelectedRepo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channel mapping");
    }
  }, [selectedGuild, selectedChannel, selectedRepo, upsertMapping]);

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
  const hasRepo = Boolean(selectedRepo);

  return (
    <SettingsCard padded={false} overflowVisible>
      <div className="settings-row settings-row-static settings-row-static-top">
        <div className="settings-row-text">
          <div className="settings-row-label settings-row-label-with-icon">
            <DiscordIcon size={16} />
            Discord
          </div>
          <p className="settings-row-description">
            Connect Discord in one step to authorize your account and install the OpenHarness bot,
            then map one channel per repository for workflow notifications and mention-driven
            triggers.
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
        <div className="workflow-detail-card workflow-detail-card-popover-host" style={{ marginTop: "1rem" }}>
          <h3 className="workflow-detail-label">Add channel mapping</h3>
          {selectedGuild ? (
            <p className="settings-muted text-sm" style={{ marginBottom: "0.75rem" }}>
              Server: <strong>{selectedGuild.guildName}</strong>
            </p>
          ) : null}
          <div className="settings-form-grid">
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
              <div className="workflow-detail-repo">
                <button
                  type="button"
                  className={`workflow-detail-select-trigger settings-input${
                    hasRepo
                      ? " workflow-detail-select-trigger-selected"
                      : " workflow-detail-select-trigger-placeholder"
                  }`}
                  aria-expanded={repoPickerOpen}
                  onClick={() => setRepoPickerOpen((open) => !open)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span className="workflow-detail-select-trigger-label">
                    {hasRepo ? selectedRepo!.fullName : "Select repository"}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={14}
                    strokeWidth={1.8}
                    className="workflow-detail-select-trigger-icon"
                    aria-hidden
                  />
                </button>
                <WorkflowRepoPicker
                  open={repoPickerOpen}
                  owner={selectedRepo?.owner ?? ""}
                  repo={selectedRepo?.repo ?? ""}
                  provider={selectedRepo?.provider ?? "github"}
                  includeAzureDevOps
                  onClose={() => setRepoPickerOpen(false)}
                  onRepoChange={() => {}}
                  onIntegrationRepoChange={setSelectedRepo}
                />
              </div>
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
