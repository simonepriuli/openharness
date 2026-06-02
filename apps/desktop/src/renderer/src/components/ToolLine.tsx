import type { ToolLineItem } from "../events";
import { formatToolLineLabel } from "../lib/tool-activity-summary";
import { Shimmer } from "./Shimmer";

export function ToolLine({
  line,
  isStreaming = false,
}: {
  line: ToolLineItem;
  isStreaming?: boolean;
}) {
  const showShimmer = line.active && isStreaming;
  const label = formatToolLineLabel(line.operation, line.active, line.path, line.isCreate);
  const added = line.linesAdded ?? 0;
  const removed = line.linesRemoved ?? 0;
  const stats =
    !line.active && (added > 0 || removed > 0) ? (
      <>
        {" "}
        {added > 0 ? <span className="tool-activity-diff-added">+{added}</span> : null}
        {removed > 0 ? (
          <>
            {added > 0 ? " " : null}
            <span className="tool-activity-diff-removed">-{removed}</span>
          </>
        ) : null}
      </>
    ) : null;

  const body = (
    <>
      {label}
      {stats}
    </>
  );

  if (showShimmer) {
    return (
      <div className="tool-activity">
        <Shimmer as="span" className="tool-activity-text">
          {body}
        </Shimmer>
      </div>
    );
  }

  return (
    <div className="tool-activity">
      <span className="tool-activity-text tool-activity-text-done">{body}</span>
    </div>
  );
}
