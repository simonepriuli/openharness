import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RepoEnvironmentVariable } from "../../../preload/api";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";

export function useRepoEnvironmentsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: remoteKeys.repoEnvironments.repos(),
    queryFn: () => harnessQueryFns.listRepoEnvironments(),
    enabled: options?.enabled ?? true,
  });
}

export function useRepoEnvironmentVariablesQuery(
  connectionId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: remoteKeys.repoEnvironments.variables(connectionId ?? ""),
    queryFn: () =>
      harnessQueryFns.listRepoEnvironmentVariables({ connectionId: connectionId! }),
    enabled: Boolean(connectionId) && (options?.enabled ?? true),
  });
}

export function useUpsertRepoEnvironmentVariableMutation(connectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.upsertRepoEnvironmentVariable,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.repoEnvironments.repos() });
      void queryClient.invalidateQueries({
        queryKey: remoteKeys.repoEnvironments.variables(connectionId),
      });
    },
  });
}

export function useDeleteRepoEnvironmentVariableMutation(connectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: harnessQueryFns.deleteRepoEnvironmentVariable,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.repoEnvironments.repos() });
      void queryClient.invalidateQueries({
        queryKey: remoteKeys.repoEnvironments.variables(connectionId),
      });
    },
  });
}

export function formatRepoEnvironmentValue(variable: RepoEnvironmentVariable): string {
  if (variable.isSecret) {
    return variable.maskedHint ?? "••••";
  }
  return variable.value ?? "";
}
