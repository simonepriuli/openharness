import type {
  SourceControlProviderId,
  WorkflowRunExecutionRecord,
} from "@openharness/shared/workflow-run";

export function runRepo(run: WorkflowRunExecutionRecord): {
  provider: SourceControlProviderId;
  namespace: string;
  repoName: string;
} {
  return {
    provider: run.provider ?? "github",
    namespace: run.namespace ?? run.githubOwner,
    repoName: run.repoName ?? run.githubRepo,
  };
}

export function extractWorkflowConfig(
  run: WorkflowRunExecutionRecord,
): import("@openharness/shared/workflow-run").WorkflowConfigSnapshot | null {
  const payload = run.payload as {
    workflow?: import("@openharness/shared/workflow-run").WorkflowConfigSnapshot;
  };
  return payload.workflow ?? null;
}
