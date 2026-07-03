import { useLayoutEffect, type RefObject } from "react";

const EDGE_MARGIN = 12;
const ANCHOR_GAP = 6;
const MAX_HEIGHT_PX = 448;
const MIN_HEIGHT_PX = 120;

export function useClampPopoverToViewport(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useLayoutEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    const anchor = panel.parentElement;
    if (!anchor) return;

    const clearStyles = () => {
      panel.style.position = "";
      panel.style.top = "";
      panel.style.bottom = "";
      panel.style.left = "";
      panel.style.right = "";
      panel.style.width = "";
      panel.style.maxHeight = "";
      panel.style.zIndex = "";
    };

    const update = () => {
      const current = panelRef.current;
      const anchorEl = current?.parentElement;
      if (!current || !anchorEl) return;

      const anchorRect = anchorEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = Math.min(400, viewportWidth - EDGE_MARGIN * 2);

      const spaceBelow = viewportHeight - EDGE_MARGIN - (anchorRect.bottom + ANCHOR_GAP);
      const spaceAbove = anchorRect.top - EDGE_MARGIN - ANCHOR_GAP;
      const openBelow = spaceBelow >= MIN_HEIGHT_PX || spaceBelow >= spaceAbove;

      current.style.position = "fixed";
      current.style.width = `${maxWidth}px`;
      current.style.zIndex = "1000";

      if (openBelow) {
        current.style.top = `${anchorRect.bottom + ANCHOR_GAP}px`;
        current.style.bottom = "auto";
        current.style.maxHeight = `${Math.max(
          MIN_HEIGHT_PX,
          Math.min(spaceBelow, MAX_HEIGHT_PX),
        )}px`;
      } else {
        current.style.top = "auto";
        current.style.bottom = `${viewportHeight - anchorRect.top + ANCHOR_GAP}px`;
        current.style.maxHeight = `${Math.max(
          MIN_HEIGHT_PX,
          Math.min(spaceAbove, MAX_HEIGHT_PX),
        )}px`;
      }

      let left = anchorRect.left;
      if (left + maxWidth > viewportWidth - EDGE_MARGIN) {
        left = viewportWidth - EDGE_MARGIN - maxWidth;
      }
      current.style.left = `${Math.max(EDGE_MARGIN, left)}px`;
      current.style.right = "auto";
    };

    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      clearStyles();
    };
  }, [open, panelRef]);
}
