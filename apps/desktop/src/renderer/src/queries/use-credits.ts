import { useQuery } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const CREDITS_STALE_MS = 60_000;

export function useOpenRouterCreditsQuery(options?: { enabled?: boolean }) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.credits(),
    queryFn: harnessQueryFns.refreshCredits,
    enabled: remoteEnabled,
    staleTime: CREDITS_STALE_MS,
  });
}
