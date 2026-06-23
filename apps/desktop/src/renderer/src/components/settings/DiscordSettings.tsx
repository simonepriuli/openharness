import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
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
import { SettingsButton } from "./SettingsButton";
import {
  WorkflowRepoPicker,
  type IntegrationRepoSelection,
} from "./workflows/WorkflowRepoPicker";
import { DiscordChannelPicker } from "./DiscordChannelPicker";

export function DiscordSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<IntegrationRepoSelection | null>(null);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [addMappingOpen, setAddMappingOpen] = useState(false);

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

  const handleCancelAddMapping = useCallback(() => {
    setAddMappingOpen(false);
    setSelectedChannelId("");
    setSelectedRepo(null);
    setChannelPickerOpen(false);
    setRepoPickerOpen(false);
    setError(null);
  }, []);

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
      setAddMappingOpen(false);
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
  const hasChannel = Boolean(selectedChannel);
  const hasRepo = Boolean(selectedRepo);
  const channelsError =
    channelsQuery.isError && channelsQuery.error instanceof Error
      ? channelsQuery.error.message
      : channelsQuery.isError
        ? "Failed to load channels"
        : null;

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

      {connected ? (
        <div className="settings-row settings-row-stack workflow-detail-card-popover-host">
          <div className="workflow-detail-section-header">
            <h3 className="workflow-detail-label">Channel mappings</h3>
            {!addMappingOpen ? (
              <SettingsButton
                size="sm"
                className="shrink-0"
                onClick={() => setAddMappingOpen(true)}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden />
                Add mapping
              </SettingsButton>
            ) : null}
          </div>

          {mappings.length > 0 ? (
            <ul className="settings-muted text-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {mappings.map((mapping) => (
                <li
                  key={mapping.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0" }}
                >
                  <span>
                    <strong>{"#"}{mapping.channelName}</strong> {"->"} {mapping.namespace ?? mapping.githubOwner}/
                    {mapping.repoName ?? mapping.githubRepo}
                  </span>
                  <SettingsButton
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => void handleDeleteMapping(mapping.id)}
                  >
                    Remove
                  </SettingsButton>
                </li>
              ))}
            </ul>
          ) : !addMappingOpen ? (
            <p className="settings-muted text-sm" style={{ margin: 0 }}>
              No channel mappings yet.
            </p>
          ) : null}

          {addMappingOpen ? (
            <>
              {selectedGuild ? (
                <p className="settings-muted text-sm" style={{ margin: 0 }}>
                  Server: <strong>{selectedGuild.guildName}</strong>
                </p>
              ) : null}
              <div
                className="settings-form-grid"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
              >
                <label className="settings-field">
                  <span>Channel</span>
                  <div className="workflow-detail-repo">
                    <button
                      type="button"
                      className={`workflow-detail-select-trigger settings-input${
                        hasChannel
                          ? " workflow-detail-select-trigger-selected"
                          : " workflow-detail-select-trigger-placeholder"
                      }`}
                      aria-expanded={channelPickerOpen}
                      disabled={!selectedGuildId || channelsQuery.isPending}
                      onClick={() => {
                        setRepoPickerOpen(false);
                        setChannelPickerOpen((open) => !open);
                      }}
                      style={{ width: "100%", textAlign: "left" }}
                    >
                      <span className="workflow-detail-select-trigger-label">
                        {hasChannel ? `#${selectedChannel!.name}` : "Select channel..."}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={14}
                        strokeWidth={1.8}
                        className="workflow-detail-select-trigger-icon"
                        aria-hidden
                      />
                    </button>
                    <DiscordChannelPicker
                      open={channelPickerOpen}
                      channels={channels}
                      channelId={selectedChannelId}
                      loading={channelsQuery.isPending || channelsQuery.isFetching}
                      error={channelsError}
                      onClose={() => setChannelPickerOpen(false)}
                      onChannelChange={setSelectedChannelId}
                    />
                  </div>
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
                      onClick={() => {
                        setChannelPickerOpen(false);
                        setRepoPickerOpen((open) => !open);
                      }}
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
              <div className="settings-api-actions">
                <SettingsButton
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={handleCancelAddMapping}
                  disabled={upsertMapping.isPending}
                >
                  Cancel
                </SettingsButton>
                <SettingsButton
                  size="sm"
                  variant="save"
                  className="shrink-0"
                  onClick={() => void handleSaveMapping()}
                  disabled={upsertMapping.isPending}
                >
                  {upsertMapping.isPending ? "Saving..." : "Save mapping"}
                </SettingsButton>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="settings-error text-sm">{error}</p> : null}
    </SettingsCard>
  );
}
