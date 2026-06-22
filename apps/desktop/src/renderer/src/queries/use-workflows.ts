import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowRecord } from "../../../preload/api";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const WORKFLOW_STALE_MS = 30_000;

function formatWorkflowError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Failed to load workflows";
  return message.includes("Not signed in") ? "Sign in to manage GitHub workflows." : message;
}

function invalidateWorkflowQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: remoteKeys.workflows() });
  void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowRuns"] });
  void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowStats"] });
}

export function useWorkflowsQuery(options?: { enabled?: boolean }) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.workflows(),
    queryFn: harnessQueryFns.listWorkflows,
    enabled: remoteEnabled,
    staleTime: WORKFLOW_STALE_MS,
  });
}

export function useWorkflowRunsQuery(
  filters?: { workflowId?: string; limit?: number; cursor?: string },
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.workflowRuns(filters),
    queryFn: () => harnessQueryFns.listWorkflowRuns(filters),
    enabled: remoteEnabled,
    staleTime: WORKFLOW_STALE_MS,
  });
}

export function useWorkflowRunStatsQuery(
  workflowId?: string,
  options?: { enabled?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.workflowStats(workflowId),
    queryFn: () => harnessQueryFns.getWorkflowRunStats({ workflowId }),
    enabled: remoteEnabled,
    staleTime: WORKFLOW_STALE_MS,
  });
}

export function useCreateWorkflowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: Parameters<typeof window.harness.createWorkflow>[0]) =>
      window.harness.createWorkflow(options),
    onSuccess: () => invalidateWorkflowQueries(queryClient),
  });
}

export function useUpdateWorkflowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: Parameters<typeof window.harness.updateWorkflow>[0]) =>
      window.harness.updateWorkflow(options),
    onSuccess: () => invalidateWorkflowQueries(queryClient),
  });
}

export function useDeleteWorkflowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workflowId: string) => window.harness.deleteWorkflow({ workflowId }),
    onSuccess: () => invalidateWorkflowQueries(queryClient),
  });
}

export function useTriggerWorkflowRunMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workflowId: string) => window.harness.triggerWorkflowRun({ workflowId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowRuns"] });
      void queryClient.invalidateQueries({ queryKey: [...remoteKeys.all, "workflowStats"] });
    },
  });
}

export function getWorkflowsQueryError(query: ReturnType<typeof useWorkflowsQuery>): string | null {
  if (!query.isError) return null;
  return formatWorkflowError(query.error);
}

export type { WorkflowRecord };
