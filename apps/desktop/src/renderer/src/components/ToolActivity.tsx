import { getToolSummaryLines, type ToolActivityItem } from "../events";
import { Shimmer } from "./Shimmer";

export function ToolActivity({ activity }: { activity: ToolActivityItem }) {
  const summaryLines = getToolSummaryLines(activity);
  if (summaryLines.length === 0) return null;

  return (
    <div className="tool-activity">
      {summaryLines.map((line, index) =>
        activity.active ? (
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
