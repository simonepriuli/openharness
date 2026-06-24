import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const BINDINGS_STALE_MS = 60_000;

export function useRunnerBindingsQuery(options?: { enabled?: boolean }) {
  const enabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.runners.bindings(),
    queryFn: () => harnessQueryFns.listRunnerBindings(),
    enabled,
    staleTime: BINDINGS_STALE_MS,
  });
}

export function useWorkflowRunnerInstanceIdQuery() {
  return useQuery({
    queryKey: remoteKeys.runners.instanceId(),
    queryFn: harnessQueryFns.getWorkflowRunnerInstanceId,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useUpsertRunnerBindingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.upsertRunnerBinding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.runners.bindings() });
    },
  });
}
