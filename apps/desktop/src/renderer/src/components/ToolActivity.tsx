import { getToolSummaryLines, type ToolActivityItem } from "../events";
import { Shimmer } from "./Shimmer";

export function ToolActivity({
  activity,
  isStreaming = false,
}: {
  activity: ToolActivityItem;
  isStreaming?: boolean;
}) {
  const summaryLines = getToolSummaryLines(activity);
  if (summaryLines.length === 0) return null;

  const showShimmer = activity.active && isStreaming;

  return (
    <div className="tool-activity">
      {summaryLines.map((line, index) =>
        showShimmer ? (
          <Shimmer key={index} as="span" className="tool-activity-text">
            {line}
          </Shimmer>
        ) : (
          <span key={index} className="tool-activity-text tool-activity-text-done">
            {line}
          </span>
        ),
      )}
    </div>
  );
}
