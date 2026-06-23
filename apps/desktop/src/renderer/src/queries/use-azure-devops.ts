import { useQuery } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const STALE_MS = 30_000;

export function useAzureDevOpsStatusQuery(options?: { enabled?: boolean }) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.azureDevOps.status(),
    queryFn: harnessQueryFns.getAzureDevOpsStatus,
    enabled: remoteEnabled,
    staleTime: STALE_MS,
  });
}

export function useAzureDevOpsReposQuery(
  filters?: { q?: string; page?: number },
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.azureDevOps.repos(filters),
    queryFn: () => harnessQueryFns.listAzureDevOpsRepos(filters),
    enabled: remoteEnabled,
    staleTime: STALE_MS,
  });
}
