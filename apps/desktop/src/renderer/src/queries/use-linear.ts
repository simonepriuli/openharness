import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

export function useLinearStatusQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.linear.status(),
    queryFn: harnessQueryFns.getLinearStatus,
    enabled,
    staleTime: 120_000,
  });
}

export function useLinearMappingsQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.linear.mappings(),
    queryFn: harnessQueryFns.listLinearMappings,
    enabled,
    staleTime: 60_000,
  });
}

export function useLinearProjectsQuery() {
  const enabled = useRemoteEnabled();
  return useQuery({
    queryKey: remoteKeys.linear.projects(),
    queryFn: harnessQueryFns.listLinearProjects,
    enabled,
    staleTime: 60_000,
  });
}

export function useOpenLinearConnectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.openLinearConnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.projects() });
    },
  });
}

export function useUpsertLinearMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.upsertLinearMapping,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.status() });
    },
  });
}

export function useDeleteLinearMappingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) => harnessQueryFns.deleteLinearMapping(mappingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.status() });
    },
  });
}

export function useDeleteLinearInstallationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.deleteLinearInstallation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.projects() });
    },
  });
}
