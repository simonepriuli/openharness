import { Clock01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowRunSummary } from "../../../../preload/api";
import { DiscordIcon } from "../icons/DiscordIcon";
import { LinearIcon } from "../icons/LinearIcon";
import { MsTeamsIcon } from "../icons/MsTeamsIcon";
import { SourceControlProviderIcon } from "../icons/SourceControlProviderIcon";

type WorkflowTriggerRun = Pick<
  WorkflowRunSummary,
  "event" | "prNumber" | "triggerLabel" | "provider"
>;

function isGitPrEvent(event: string): boolean {
  return event.startsWith("pr_") || event === "review_submitted";
}

export function workflowTriggerTooltip(run: WorkflowTriggerRun): string {
  if (run.prNumber > 0) {
    return `PR #${run.prNumber}: ${run.triggerLabel}`;
  }
  return run.triggerLabel;
}

export function WorkflowTriggerIcon({ run }: { run: WorkflowTriggerRun }) {
  const label = workflowTriggerTooltip(run);

  let icon;
  if (run.event === "schedule") {
    icon = <HugeiconsIcon icon={Clock01Icon} size={15} strokeWidth={1.75} aria-hidden />;
  } else if (run.event === "manual") {
    icon = <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.75} aria-hidden />;
  } else if (run.event === "teams_mention") {
    icon = <MsTeamsIcon size={15} className="workflow-trigger-icon" />;
  } else if (run.event === "discord_mention") {
    icon = <DiscordIcon size={15} className="workflow-trigger-icon" />;
  } else if (run.event.startsWith("linear_")) {
    icon = <LinearIcon size={15} className="workflow-trigger-icon" />;
  } else if (isGitPrEvent(run.event)) {
    icon = (
      <SourceControlProviderIcon
        provider={run.provider ?? "github"}
        size={15}
        className="workflow-trigger-icon"
      />
    );
  } else {
    icon = <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.75} aria-hidden />;
  }

  return (
    <span className="workflow-trigger-kind-icon" title={label} aria-label={label}>
      {icon}
    </span>
  );
}
