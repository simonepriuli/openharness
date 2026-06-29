import { CloudIcon, ComputerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowRunSummary } from "../../../../preload/api";

export function workflowRunnerKindLabel(run: Pick<WorkflowRunSummary, "runnerKind" | "resolvedExecutor" | "status">): string {
  if (run.runnerKind === "cloud") return "Cloud";
  if (run.runnerKind === "desktop") return "Local";
  if (run.resolvedExecutor === "cloud") return "Cloud pending";
  return "Local pending";
}

export function WorkflowRunnerKindBadge({
  run,
}: {
  run: Pick<WorkflowRunSummary, "runnerKind" | "resolvedExecutor" | "status">;
}) {
  const label = workflowRunnerKindLabel(run);
  const isCloud =
    run.runnerKind === "cloud" ||
    (run.runnerKind !== "desktop" && run.resolvedExecutor === "cloud");
  const isPending = run.runnerKind !== "cloud" && run.runnerKind !== "desktop";

  return (
    <span
      className={`workflow-runner-kind-icon${isPending ? " workflow-runner-kind-icon-pending" : ""}`}
      title={label}
      aria-label={label}
    >
      <HugeiconsIcon
        icon={isCloud ? CloudIcon : ComputerIcon}
        size={15}
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
}
