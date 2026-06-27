export const ACTIVE_WORKFLOW_RUN_STATUSES = new Set(["pending", "claimed", "running"]);

export type WorkflowRunStatusVariant = "success" | "failed" | "running" | "pending";

export function workflowRunStatusVariant(status: string): WorkflowRunStatusVariant {
  if (status === "done") return "success";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "pending";
}

export function formatWorkflowRunStatusLabel(status: string): string {
  if (status === "done") return "Succeeded";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  if (status === "claimed") return "Claimed";
  if (status === "pending") return "Pending";
  return status;
}

type WorkflowRunStatusBadgeProps = {
  status: string;
  /** When true, in-progress runs show the live dot (e.g. local runner is active). */
  live?: boolean;
};

export function WorkflowRunStatusBadge({ status, live = false }: WorkflowRunStatusBadgeProps) {
  const variant = workflowRunStatusVariant(status);
  const showLiveDot = live || variant === "running";

  return (
    <span
      className={`workflow-run-status workflow-run-status-${variant}${showLiveDot ? " workflow-run-status-live" : ""}`}
    >
      {showLiveDot ? <span className="workflow-run-status-live-dot" aria-hidden /> : null}
      {formatWorkflowRunStatusLabel(status)}
    </span>
  );
}

export function countActiveWorkflowRuns(
  runs: { status: string }[],
): number {
  return runs.filter((run) => ACTIVE_WORKFLOW_RUN_STATUSES.has(run.status)).length;
}
