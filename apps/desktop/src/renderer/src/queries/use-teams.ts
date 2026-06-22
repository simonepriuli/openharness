import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

export function useTeamsStatusQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.teams.status(),
    queryFn: harnessQueryFns.getTeamsStatus,
    enabled,
    staleTime: 120_000,
  });
}

export function useTeamsMappingsQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.teams.mappings(),
    queryFn: harnessQueryFns.listTeamsMappings,
    enabled,
    staleTime: 60_000,
  });
}

export function useTeamsForUserQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.teams.teams(),
    queryFn: harnessQueryFns.listTeamsForUser,
    enabled,
    staleTime: 60_000,
  });
}

export function useTeamsChannelsQuery(teamId: string | null) {
  const enabled = useRemoteEnabled() && Boolean(teamId);
  return useQuery({
    queryKey: remoteKeys.teams.channels(teamId ?? ""),
    queryFn: () => harnessQueryFns.listTeamsChannels({ teamId: teamId! }),
    enabled,
    staleTime: 30_000,
  });
}

export function useOpenTeamsConnectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.openTeamsConnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.teams() });
    },
  });
}

export function useUpsertTeamsMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.upsertTeamsMapping,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.status() });
    },
  });
}

export function useDeleteTeamsMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) => harnessQueryFns.deleteTeamsMapping(mappingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.teams.status() });
    },
  });
}
