import { useCallback, useEffect, useState } from "react";
import type { GithubProjectConnection, GithubStatus } from "../../../preload/api";

export function useGithubConnection(projectPath: string | null) {
  const [connection, setConnection] = useState<GithubProjectConnection | null>(null);
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setConnection(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextConnection, nextStatus] = await Promise.all([
        window.harness.getGithubConnection({ projectPath }),
        window.harness.getGithubStatus(),
      ]);
      setConnection(nextConnection);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub connection");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(
    async (options: { owner: string; repo: string; remoteUrl?: string | null }) => {
      if (!projectPath) return null;
      const result = await window.harness.connectGithubRepo({
        projectPath,
        owner: options.owner,
        repo: options.repo,
        remoteUrl: options.remoteUrl,
      });
      setConnection(result);
      return result;
    },
    [projectPath],
  );

  const disconnect = useCallback(async () => {
    if (!projectPath) return;
    await window.harness.disconnectGithubRepo({ projectPath });
    setConnection({ connected: false });
  }, [projectPath]);

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
