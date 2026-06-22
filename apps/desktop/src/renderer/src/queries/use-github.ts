import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const GITHUB_STATUS_STALE_MS = 120_000;
const GITHUB_CONNECTION_STALE_MS = 60_000;
const GITHUB_PICKER_STALE_MS = 30_000;

export function useGithubStatusQuery(options?: { enabled?: boolean }) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.github.status(),
    queryFn: harnessQueryFns.getGithubStatus,
    enabled: remoteEnabled,
    staleTime: GITHUB_STATUS_STALE_MS,
  });
}

export function useSessionDiagnosticsQuery(options?: { enabled?: boolean }) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.session.diagnostics(),
    queryFn: harnessQueryFns.getSessionDiagnostics,
    enabled: remoteEnabled,
    staleTime: GITHUB_STATUS_STALE_MS,
  });
}

export function useGithubConnectionQuery(
  projectPath: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled && Boolean(projectPath));

  return useQuery({
    queryKey: remoteKeys.github.connection(projectPath ?? ""),
    queryFn: () => harnessQueryFns.getGithubConnection(projectPath!),
    enabled: remoteEnabled && Boolean(projectPath),
    staleTime: GITHUB_CONNECTION_STALE_MS,
  });
}

export function useGithubReposQuery(
  filters?: { q?: string; page?: number },
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.github.repos(filters),
    queryFn: () => harnessQueryFns.listGithubRepos(filters),
    enabled: remoteEnabled,
    staleTime: GITHUB_PICKER_STALE_MS,
  });
}

export function useRepoBranchesQuery(
  owner: string,
  repo: string,
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled && Boolean(owner && repo));

  return useQuery({
    queryKey: remoteKeys.github.branches(owner, repo),
    queryFn: () => harnessQueryFns.listRepoBranches({ owner, repo }),
    enabled: remoteEnabled && Boolean(owner && repo),
    staleTime: GITHUB_PICKER_STALE_MS,
  });
}

export function useConnectGithubRepoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.connectGithubRepo,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: remoteKeys.github.connection(variables.projectPath),
      });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.github.status() });
    },
  });
}

export function useDisconnectGithubRepoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectPath: string) => harnessQueryFns.disconnectGithubRepo(projectPath),
    onSuccess: (_data, projectPath) => {
      void queryClient.invalidateQueries({
        queryKey: remoteKeys.github.connection(projectPath),
      });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.github.status() });
    },
  });
}

export function useOpenGithubInstallMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.openGithubInstall,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.github.status() });
    },
  });
}

export function useGithubConnectionsByPath(projectPaths: string[]) {
  const remoteEnabled = useRemoteEnabled();

  return useQueries({
    queries: projectPaths.map((projectPath) => ({
      queryKey: remoteKeys.github.connection(projectPath),
      queryFn: () => harnessQueryFns.getGithubConnection(projectPath),
      enabled: remoteEnabled && Boolean(projectPath),
      staleTime: GITHUB_CONNECTION_STALE_MS,
    })),
  });
}

export function useGithubConnectedByPath(projectPaths: string[]): Record<string, boolean> {
  const queries = useGithubConnectionsByPath(projectPaths);

  return projectPaths.reduce<Record<string, boolean>>((acc, projectPath, index) => {
    const data = queries[index]?.data;
    acc[projectPath] = data?.connected === true;
    return acc;
  }, {});
}
