import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

export function useDiscordStatusQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.discord.status(),
    queryFn: harnessQueryFns.getDiscordStatus,
    enabled,
    staleTime: 120_000,
  });
}

export function useDiscordMappingsQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.discord.mappings(),
    queryFn: harnessQueryFns.listDiscordMappings,
    enabled,
    staleTime: 60_000,
  });
}

export function useDiscordGuildsQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.discord.guilds(),
    queryFn: harnessQueryFns.listDiscordGuilds,
    enabled,
    staleTime: 60_000,
  });
}

export function useDiscordChannelsQuery(guildId: string | null) {
  const enabled = useRemoteEnabled() && Boolean(guildId);
  return useQuery({
    queryKey: remoteKeys.discord.channels(guildId ?? ""),
    queryFn: () => harnessQueryFns.listDiscordChannels({ guildId: guildId! }),
    enabled,
    staleTime: 30_000,
  });
}

export function useOpenDiscordConnectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.openDiscordConnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.guilds() });
    },
  });
}

export function useUpsertDiscordMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.upsertDiscordMapping,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.status() });
    },
  });
}

export function useDeleteDiscordMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) => harnessQueryFns.deleteDiscordMapping(mappingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.discord.status() });
    },
  });
}
