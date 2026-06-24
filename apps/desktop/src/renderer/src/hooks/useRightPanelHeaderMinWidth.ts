import { useLayoutEffect, useState, type RefObject } from "react";
import {
  EXPLORER_RESIZER_WIDTH,
  MIN_EXPLORER_PREVIEW_WIDTH,
  MIN_EXPLORER_TREE_WIDTH,
} from "./useProjectExplorerResize";
import { MIN_RIGHT_PANEL_WIDTH } from "./useRightPanelResize";

const MIN_RIGHT_PANEL_BODY_WIDTH =
  MIN_EXPLORER_TREE_WIDTH + EXPLORER_RESIZER_WIDTH + MIN_EXPLORER_PREVIEW_WIDTH;

function measureHeaderMinWidth(header: HTMLElement): number {
  const previousWidth = header.style.width;
  const previousMaxWidth = header.style.maxWidth;

  header.style.width = "max-content";
  header.style.maxWidth = "max-content";
  const measured = Math.ceil(header.getBoundingClientRect().width);
  header.style.width = previousWidth;
  header.style.maxWidth = previousMaxWidth;

  return Math.max(MIN_RIGHT_PANEL_WIDTH, MIN_RIGHT_PANEL_BODY_WIDTH, measured);
}

export function useRightPanelHeaderMinWidth(headerRef: RefObject<HTMLElement | null>): number {
  const [minWidth, setMinWidth] = useState(() =>
    Math.max(MIN_RIGHT_PANEL_WIDTH, MIN_RIGHT_PANEL_BODY_WIDTH),
  );

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateMinWidth = () => {
      setMinWidth((current) => {
        const next = measureHeaderMinWidth(header);
        return current === next ? current : next;
      });
    };

    updateMinWidth();

    const observer = new ResizeObserver(updateMinWidth);
    observer.observe(header);
    for (const child of header.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [headerRef]);

  return minWidth;
}
