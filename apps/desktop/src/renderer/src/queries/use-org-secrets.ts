import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";
import { useOrgCanManageQuery } from "./use-org";

const ORG_SECRETS_STALE_MS = 30_000;

export function useOrgSecretsQuery(options?: { enabled?: boolean }) {
  const canManageQuery = useOrgCanManageQuery(options);
  const canManage = canManageQuery.data?.canManage ?? false;
  const remoteEnabled = useRemoteEnabled(options?.enabled);
  const enabled = remoteEnabled && canManage;

  return useQuery({
    queryKey: remoteKeys.org.secrets(),
    queryFn: harnessQueryFns.getOrgSecrets,
    enabled,
    staleTime: ORG_SECRETS_STALE_MS,
  });
}

export function useUpsertOrgSecretMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.upsertOrgSecret,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.secrets() });
    },
  });
}

export function useDeleteOrgSecretMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.deleteOrgSecret,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.secrets() });
    },
  });
}
