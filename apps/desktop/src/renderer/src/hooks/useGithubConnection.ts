import { useCallback } from "react";
import type { GithubProjectConnection } from "../../../preload/api";
import {
  useConnectGithubRepoMutation,
  useDisconnectGithubRepoMutation,
  useGithubConnectionQuery,
  useGithubStatusQuery,
} from "../queries/use-github";

function getConnectionError(connection: GithubProjectConnection | undefined): string | null {
  if (!connection) return null;
  if ("error" in connection && connection.error) {
    return connection.error;
  }
  return null;
}

export function useGithubConnection(projectPath: string | null) {
  const connectionQuery = useGithubConnectionQuery(projectPath);
  const statusQuery = useGithubStatusQuery();
  const connectMutation = useConnectGithubRepoMutation();
  const disconnectMutation = useDisconnectGithubRepoMutation();

  const refresh = useCallback(async () => {
    await Promise.all([connectionQuery.refetch(), statusQuery.refetch()]);
  }, [connectionQuery, statusQuery]);

  const connect = useCallback(
    async (options: { owner: string; repo: string; remoteUrl?: string | null }) => {
      if (!projectPath) return null;
      return connectMutation.mutateAsync({
        projectPath,
        owner: options.owner,
        repo: options.repo,
        remoteUrl: options.remoteUrl,
      });
    },
    [connectMutation, projectPath],
  );

  const disconnect = useCallback(async () => {
    if (!projectPath) return;
    await disconnectMutation.mutateAsync(projectPath);
  }, [disconnectMutation, projectPath]);

  const connection = projectPath ? (connectionQuery.data ?? null) : null;
  const status = statusQuery.data ?? null;
  const loading =
    Boolean(projectPath) &&
    (connectionQuery.isPending || statusQuery.isPending || connectionQuery.isFetching);
  const error =
    (connectionQuery.isError
      ? connectionQuery.error instanceof Error
        ? connectionQuery.error.message
        : "Failed to load GitHub connection"
      : null) ??
    getConnectionError(connection ?? undefined) ??
    (status?.error ?? null);

  return {
    connection,
    status,
    loading,
    error,
    refresh,
    connect,
    disconnect,
    isConnected: connection?.connected === true,
    agentReady: status?.agentReady ?? false,
  };
}

export { useGithubConnectedByPath, useGithubConnectionsByPath } from "../queries/use-github";
