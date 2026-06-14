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
  if (!item.active || !isStreaming) return null;

  const showShimmer = !item.content.trim();

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [item.content]);

  if (!item.content.trim() && !showShimmer) return null;

  return (
    <div className="reasoning-block">
      <div className="reasoning-block-toggle">
        <Shimmer as="span">Reasoning</Shimmer>
      </div>
      {item.content.trim() ? (
        <div ref={scrollRef} className="reasoning-scroll">
          {item.content}
        </div>
      ) : null}
    </div>
  );
}
