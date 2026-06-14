import { useEffect, useRef } from "react";
import type { ReasoningItem } from "../events";
import { Shimmer } from "./Shimmer";

export function ReasoningBlock({
  item,
  isStreaming = false,
}: {
  item: ReasoningItem;
  isStreaming?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showShimmer = item.active && isStreaming && !item.content.trim();

  useEffect(() => {
    if (!item.active || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [item.active, item.content]);

  if (!item.content.trim() && !showShimmer) return null;

  return (
    <details
      className="reasoning-block"
      open={item.active && isStreaming ? true : undefined}
    >
      <summary className="reasoning-block-toggle">
        {item.active && isStreaming ? (
          <Shimmer as="span">Reasoning</Shimmer>
        ) : (
          "Reasoning"
        )}
        <ReasoningChevron />
      </summary>
      {item.content.trim() ? (
        <div ref={scrollRef} className="reasoning-scroll">
          {item.content}
        </div>
      ) : null}
    </details>
  );
}

function ReasoningChevron() {
  return (
    <svg
      className="reasoning-block-chevron"
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
