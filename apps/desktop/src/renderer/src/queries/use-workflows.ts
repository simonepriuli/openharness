import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { WorkflowRecord } from "../../../preload/api";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const WORKFLOW_STALE_MS = 30_000;
const WORKFLOW_RUN_POLL_MS = 3_000;

function isWorkflowRunInProgress(status: string | undefined): boolean {
  return status === "running" || status === "pending" || status === "claimed";
}

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
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((run) => isWorkflowRunInProgress(run.status))
        ? WORKFLOW_RUN_POLL_MS
        : false;
    },
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

export function useWorkflowRunQuery(
  runId: string | null,
  options?: { enabled?: boolean; isStreaming?: boolean },
) {
  const remoteEnabled = useRemoteEnabled(options?.enabled && !!runId);

  return useQuery({
    queryKey: remoteKeys.workflowRun(runId ?? ""),
    queryFn: () => harnessQueryFns.getWorkflowRun(runId!),
    enabled: remoteEnabled && !!runId,
    staleTime: WORKFLOW_STALE_MS,
    refetchInterval: (query) => {
      if (options?.isStreaming) return WORKFLOW_RUN_POLL_MS;
      const status = query.state.data?.run.status;
      return isWorkflowRunInProgress(status) ? WORKFLOW_RUN_POLL_MS : false;
    },
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

export function useDismissWorkflowRunMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: { runId: string; reason?: string }) =>
      window.harness.dismissWorkflowRun(options),
    onSuccess: (data) => {
      invalidateWorkflowQueries(queryClient);
      void queryClient.setQueryData(remoteKeys.workflowRun(data.run.id), data);
    },
  });
}

export function getWorkflowsQueryError(query: ReturnType<typeof useWorkflowsQuery>): string | null {
  if (!query.isError) return null;
  return formatWorkflowError(query.error);
}

export type { WorkflowRecord };
