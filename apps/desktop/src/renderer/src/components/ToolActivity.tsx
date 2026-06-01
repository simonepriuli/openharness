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

  return (
    <div className="tool-activity">
      {showShimmer ? (
        <Shimmer as="span" className="tool-activity-text">
          {summary}
        </Shimmer>
      ) : (
        <span className="tool-activity-text tool-activity-text-done">{summary}</span>
      )}
    </div>
  );
}
