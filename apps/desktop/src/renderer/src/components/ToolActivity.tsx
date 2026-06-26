import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getToolActivityDisplay, type ToolActivityItem } from "../events";
import { formatSupplementSummary, isWebSearchToolActivity } from "../lib/tool-activity-summary";
import { Shimmer } from "./Shimmer";
import { SwarmWorkerRow } from "./SwarmWorkerRow";

/** Summary row for non-file tools (bash, grep, custom tools, reasoning). */
export function ToolActivity({
  activity,
  isStreaming = false,
}: {
  activity: ToolActivityItem;
  isStreaming?: boolean;
}) {
  const display = getToolActivityDisplay(activity);
  const supplement = formatSupplementSummary({
    totals: activity.totals,
    active: activity.active,
    reasoning: activity.reasoning,
    currentAction: activity.currentAction,
  });
  const text = supplement || display?.text;
  const showShimmer = activity.active && isStreaming;
  const runningWorkers =
    showShimmer && isSwarmDispatchActivity(activity, text ?? "")
      ? (activity.swarmWorkers?.filter((worker) => worker.status === "running") ?? [])
      : [];

  if (runningWorkers.length > 0) {
    return (
      <div className="tool-activity tool-activity-swarm">
        <div className="tool-activity-group">
          {runningWorkers.map((worker) => (
            <SwarmWorkerRow
              key={worker.index}
              worker={worker}
              model={activity.swarmModel}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!text) return null;

  const showWebSearchIcon = isWebSearchToolActivity(activity);

  const leadingIcon = showWebSearchIcon ? (
    <span className="tool-activity-leading-icon" aria-hidden>
      <HugeiconsIcon icon={Globe02Icon} size={11} strokeWidth={1.7} />
    </span>
  ) : null;

  const textClassName = [
    "tool-activity-text",
    showWebSearchIcon ? "tool-activity-text-icon" : undefined,
    !showShimmer ? "tool-activity-text-done" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="tool-activity">
      {showShimmer ? (
        <Shimmer as="span" className={textClassName}>
          {leadingIcon}
          <span>{text}</span>
        </Shimmer>
      ) : (
        <span className={textClassName}>
          {leadingIcon}
          <span>{text}</span>
        </span>
      )}
    </div>
  );
}

function isSwarmDispatchActivity(activity: ToolActivityItem, summary: string): boolean {
  const action = activity.currentAction?.toLowerCase() ?? "";
  const normalizedSummary = summary.toLowerCase();
  if (activity.swarmWorkers?.length || activity.swarmTasks?.length) return true;
  return (
    action.includes("swarm_dispatch") ||
    action.includes("swarm dispatch") ||
    normalizedSummary.includes("swarm_dispatch") ||
    normalizedSummary.includes("swarm dispatch")
  );
}
