import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export const DEFAULT_RIGHT_PANEL_WIDTH = 560;
export const MIN_RIGHT_PANEL_WIDTH = 420;
export const MIN_CHAT_MAIN_WIDTH = 320;
export const RIGHT_PANEL_RESIZER_WIDTH = 6;

export function clampRightPanelWidth(nextWidth: number, containerWidth: number): number {
  const maxByRatio = containerWidth * 0.5;
  const maxByMainMin = containerWidth - MIN_CHAT_MAIN_WIDTH - RIGHT_PANEL_RESIZER_WIDTH;
  const max = Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(maxByRatio, maxByMainMin));

  return Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(max, nextWidth));
}

export function applyRightPanelWidth(panel: HTMLElement, nextWidth: number): void {
  const px = `${nextWidth}px`;
  panel.style.width = px;
  panel.style.maxWidth = px;
  panel.style.flex = `0 0 ${px}`;
}

type UseRightPanelResizeOptions = {
  width: number;
  onWidthChange: (width: number) => void;
  containerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
};

export function useRightPanelResize({
  width,
  onWidthChange,
  containerRef,
  panelRef,
}: UseRightPanelResizeOptions) {
  const pendingWidthRef = useRef(width);

  useLayoutEffect(() => {
    pendingWidthRef.current = width;
    if (panelRef.current) {
      applyRightPanelWidth(panelRef.current, width);
    }
  }, [panelRef, width]);

  const clampWidth = useCallback(
    (nextWidth: number) => {
      const container = containerRef.current;
      if (!container) return nextWidth;

      return clampRightPanelWidth(nextWidth, container.getBoundingClientRect().width);
    },
    [containerRef],
  );

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();

      const startX = event.clientX;
      const startWidth = width;
      const target = event.currentTarget;
      const panel = panelRef.current;

      target.setPointerCapture?.(event.pointerId);
      document.body.classList.add("right-panel-resizing");

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampWidth(startWidth - (moveEvent.clientX - startX));
        pendingWidthRef.current = nextWidth;
        if (panel) {
          applyRightPanelWidth(panel, nextWidth);
        }
      };

      const onPointerEnd = (endEvent: PointerEvent) => {
        document.body.classList.remove("right-panel-resizing");
        target.releasePointerCapture?.(endEvent.pointerId);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerEnd);
        window.removeEventListener("pointercancel", onPointerEnd);
        onWidthChange(pendingWidthRef.current);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
    },
    [clampWidth, onWidthChange, panelRef, width],
  );

  return { onResizePointerDown, clampWidth };
}
