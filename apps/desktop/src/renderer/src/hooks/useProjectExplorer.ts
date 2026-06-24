import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export const projectExplorerKeys = {
  all: ["projectExplorer"] as const,
  paths: (cwd: string | null) => [...projectExplorerKeys.all, "paths", cwd] as const,
  gitStatus: (cwd: string | null, refreshKey: number) =>
    [...projectExplorerKeys.all, "gitStatus", cwd, refreshKey] as const,
  fileContents: (cwd: string | null, relativePath: string | null) =>
    [...projectExplorerKeys.all, "fileContents", cwd, relativePath] as const,
};

export function useProjectFilePaths(enabled: boolean, cwd: string | null) {
  return useQuery({
    queryKey: projectExplorerKeys.paths(cwd),
    enabled: enabled && cwd != null,
    queryFn: async () => {
      const result = await window.harness.listProjectFiles({ cwd: cwd! });
      return result.paths;
    },
    staleTime: 30_000,
  });
}

export function useProjectGitStatus(
  enabled: boolean,
  cwd: string | null,
  refreshKey: number,
) {
  return useQuery({
    queryKey: projectExplorerKeys.gitStatus(cwd, refreshKey),
    enabled: enabled && cwd != null,
    queryFn: async () => {
      const result = await window.harness.getProjectGitStatus({ cwd: cwd! });
      return result.entries;
    },
    staleTime: 5_000,
  });
}

export function useProjectFileContents(cwd: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: projectExplorerKeys.fileContents(cwd, relativePath),
    enabled: cwd != null && relativePath != null,
    queryFn: async () => {
      if (!cwd || !relativePath) {
        return { ok: false as const, relativePath: "", error: "not_found" as const };
      }
      return window.harness.readProjectFile({ cwd, relativePath });
    },
    staleTime: 10_000,
  });
}

/**
 * Watches the currently-selected file on disk (scoped to that single file in
 * the main process) and invalidates its contents query whenever it changes, so
 * the preview reflects edits made by an agent or external tooling live.
 */
export function useWatchProjectFile(cwd: string | null, relativePath: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (cwd == null || relativePath == null) return;
    const api = window.harness;
    if (typeof api?.watchProjectFile !== "function") return;

    void api.watchProjectFile({ cwd, relativePath });

    const unsubscribe = api.onProjectFileChanged((payload) => {
      if (payload.cwd !== cwd || payload.relativePath !== relativePath) return;
      void queryClient.invalidateQueries({
        queryKey: projectExplorerKeys.fileContents(cwd, relativePath),
      });
    });

    return () => {
      unsubscribe();
      void api.unwatchProjectFile?.();
    };
  }, [cwd, relativePath, queryClient]);
}
