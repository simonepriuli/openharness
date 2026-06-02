import { SwarmIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getToolSummaryLine, type ToolActivityItem } from "../events";
import { Shimmer } from "./Shimmer";

export function ToolActivity({
  activity,
  isStreaming = false,
}: {
  activity: ToolActivityItem;
  isStreaming?: boolean;
}) {
  const summary = getToolSummaryLine(activity);
  if (!summary) return null;

  const showShimmer = activity.active && isStreaming;
  const swarmShimmerRows = showShimmer ? getSwarmShimmerRows(activity, summary) : [];
  const renderSwarmRows = swarmShimmerRows.length > 1;

  return (
    <div className="tool-activity">
      {showShimmer && renderSwarmRows ? (
        <div className="tool-activity-group">
          {swarmShimmerRows.map((label, index) => (
            <Shimmer as="span" className="tool-activity-text tool-activity-text-swarm" key={`${activity.id}-${index}`}>
              <span className="tool-activity-swarm-icon" aria-hidden>
                <HugeiconsIcon icon={SwarmIcon} size={11} strokeWidth={1.7} />
              </span>
              <span>{label}</span>
            </Shimmer>
          ))}
        </div>
      ) : showShimmer ? (
        <Shimmer as="span" className="tool-activity-text">
          {summary}
        </Shimmer>
      ) : (
        <span className="tool-activity-text tool-activity-text-done">{summary}</span>
      )}
    </div>
  );
}

function getSwarmShimmerRows(activity: ToolActivityItem, summary: string): string[] {
  if (!isSwarmDispatchActivity(activity, summary)) return [summary];
  const taskActions = activity.swarmTasks?.filter((task) => task.trim().length > 0) ?? [];
  if (taskActions.length > 0) {
    return taskActions.map((task, index) => `Sub-agent ${index + 1}: ${shortenAction(task)}`);
  }
  const commandCount = getSwarmCommandCount(activity, summary);
  if (commandCount <= 1) return [summary];
  return Array.from({ length: commandCount }, (_, index) => `Sub-agent ${index + 1}: running`);
}

function isSwarmDispatchActivity(activity: ToolActivityItem, summary: string): boolean {
  const action = activity.currentAction?.toLowerCase() ?? "";
  const normalizedSummary = summary.toLowerCase();
  return action.includes("swarm_dispatch") || action.includes("swarm dispatch") || normalizedSummary.includes("swarm_dispatch") || normalizedSummary.includes("swarm dispatch");
}

function getSwarmCommandCount(activity: ToolActivityItem, summary: string): number {
  const summaryMatch = summary.match(/\brunning\s+(\d+)\s+commands?\b/i);
  if (summaryMatch) return clampSwarmCount(Number(summaryMatch[1]));
  if (activity.totals.bash > 1) return clampSwarmCount(activity.totals.bash);
  return 1;
}

function clampSwarmCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.trunc(count), 1), 12);
}

function shortenAction(action: string): string {
  const normalized = action.replace(/\s+/g, " ").trim();
  if (!normalized) return "running";
  if (normalized.length <= 70) return normalized;
  return `${normalized.slice(0, 67)}...`;
}
