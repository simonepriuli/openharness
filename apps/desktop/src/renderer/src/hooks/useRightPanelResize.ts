import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export const DEFAULT_RIGHT_PANEL_WIDTH = 420;
export const MIN_RIGHT_PANEL_WIDTH = 420;
export const MIN_CHAT_MAIN_WIDTH = 320;
export const RIGHT_PANEL_RESIZER_WIDTH = 6;

export function clampRightPanelWidth(nextWidth: number, containerWidth: number): number {
  const maxByRatio = containerWidth * 0.5;
  const maxByMainMin = containerWidth - MIN_CHAT_MAIN_WIDTH - RIGHT_PANEL_RESIZER_WIDTH;
  const max = Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(maxByRatio, maxByMainMin));

  return Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(max, nextWidth));
}

type UseRightPanelResizeOptions = {
  width: number;
  onWidthChange: (width: number) => void;
  containerRef: RefObject<HTMLElement | null>;
};

export function useRightPanelResize({
  width,
  onWidthChange,
  containerRef,
}: UseRightPanelResizeOptions) {
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

      target.setPointerCapture?.(event.pointerId);
      document.body.classList.add("right-panel-resizing");

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth - (moveEvent.clientX - startX);
        onWidthChange(clampWidth(nextWidth));
      };

      const onPointerEnd = (endEvent: PointerEvent) => {
        document.body.classList.remove("right-panel-resizing");
        target.releasePointerCapture?.(endEvent.pointerId);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerEnd);
        window.removeEventListener("pointercancel", onPointerEnd);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
    },
    [clampWidth, onWidthChange, width],
  );

  return { onResizePointerDown, clampWidth };
}
