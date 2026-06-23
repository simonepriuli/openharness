import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export const DEFAULT_EXPLORER_TREE_WIDTH = 240;
export const MIN_EXPLORER_TREE_WIDTH = 220;
export const MIN_EXPLORER_PREVIEW_WIDTH = 200;
export const EXPLORER_RESIZER_WIDTH = 6;
const MAX_EXPLORER_TREE_RATIO = 0.45;

export function clampExplorerTreeWidth(nextWidth: number, containerWidth: number): number {
  const maxTreeByPreview = containerWidth - MIN_EXPLORER_PREVIEW_WIDTH - EXPLORER_RESIZER_WIDTH;
  const maxTreeByRatio = containerWidth * MAX_EXPLORER_TREE_RATIO;
  const maxTree = Math.min(maxTreeByPreview, maxTreeByRatio);
  const minTree = Math.min(MIN_EXPLORER_TREE_WIDTH, maxTree);

  return Math.max(minTree, Math.min(maxTree, nextWidth));
}

type UseProjectExplorerResizeOptions = {
  treeWidth: number;
  onTreeWidthChange: (width: number) => void;
};

export function useProjectExplorerResize({
  treeWidth,
  onTreeWidthChange,
}: UseProjectExplorerResizeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  const clampWidth = useCallback((nextWidth: number) => {
    const container = containerRef.current;
    if (!container) return nextWidth;

    return clampExplorerTreeWidth(nextWidth, container.getBoundingClientRect().width);
  }, []);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();

      const startX = event.clientX;
      const startWidth = treeWidth;
      const target = event.currentTarget;

      target.setPointerCapture?.(event.pointerId);
      document.body.classList.add("project-explorer-resizing");

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + (moveEvent.clientX - startX);
        onTreeWidthChange(clampWidth(nextWidth));
      };

      const onPointerEnd = (endEvent: PointerEvent) => {
        document.body.classList.remove("project-explorer-resizing");
        target.releasePointerCapture?.(endEvent.pointerId);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerEnd);
        window.removeEventListener("pointercancel", onPointerEnd);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
    },
    [clampWidth, onTreeWidthChange, treeWidth],
  );

  return { containerRef, onResizePointerDown, clampWidth };
}
