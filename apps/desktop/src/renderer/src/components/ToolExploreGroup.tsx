import type { ToolLineItem } from "../events";
import { ToolLine } from "./ToolLine";

export const VISIBLE_EXPLORE_COUNT = 4;

export function ToolExploreGroup({
  lines,
  isStreaming = false,
}: {
  lines: ToolLineItem[];
  isStreaming?: boolean;
}) {
  const hiddenCount = lines.length - VISIBLE_EXPLORE_COUNT;
  const visibleLines = lines.slice(0, VISIBLE_EXPLORE_COUNT);
  const hiddenLines = lines.slice(VISIBLE_EXPLORE_COUNT);

  return (
    <div className="tool-activity-group">
      {visibleLines.map((line) => (
        <ToolLine key={line.id} line={line} isStreaming={isStreaming} />
      ))}
      {hiddenCount > 0 ? (
        <details className="tool-explore-more">
          <summary className="tool-explore-more-toggle">
            and {hiddenCount} other {hiddenCount === 1 ? "file" : "files"}
            <ExploreChevron />
          </summary>
          {hiddenLines.map((line) => (
            <ToolLine key={line.id} line={line} isStreaming={isStreaming} />
          ))}
        </details>
      ) : null}
    </div>
  );
}

function ExploreChevron() {
  return (
    <svg
      className="tool-explore-more-chevron"
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 4.5 10 8 6 11.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
