import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeSelectionSnapshot } from "../lib/code-selection";
import { readCodeSelection } from "../lib/code-selection";
import type { SelectionActionId } from "../lib/selection-action-messages";

export type SelectionToolbarState = CodeSelectionSnapshot;

type UseCodeSelectionToolbarOptions = {
  onAction: (actionId: SelectionActionId, snapshot: SelectionToolbarState) => void;
};

export function useCodeSelectionToolbar({ onAction }: UseCodeSelectionToolbarOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarState, setToolbarState] = useState<SelectionToolbarState | null>(null);

  const dismiss = useCallback(() => {
    setToolbarState(null);
  }, []);

  const readSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const snapshot = readCodeSelection(container);
    setToolbarState(snapshot);
  }, []);

  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(readSelection);
  }, [readSelection]);

  const handleActionClick = useCallback(
    (actionId: SelectionActionId) => {
      if (!toolbarState) return;
      onAction(actionId, toolbarState);
      dismiss();
    },
    [dismiss, onAction, toolbarState],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mouseup", handleMouseUp);
    return () => container.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  useEffect(() => {
    if (!toolbarState) return;

    const handleSelectionChange = () => {
      const container = containerRef.current;
      if (!container) {
        dismiss();
        return;
      }
      const snapshot = readCodeSelection(container);
      if (!snapshot) dismiss();
      else setToolbarState(snapshot);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) return;
      dismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    const scrollRoot = containerRef.current?.closest(".project-explorer-preview-body");
    const handleScroll = () => dismiss();

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    scrollRoot?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      scrollRoot?.removeEventListener("scroll", handleScroll);
    };
  }, [dismiss, toolbarState]);

  return {
    containerRef,
    toolbarRef,
    toolbarState,
    dismiss,
    handleActionClick,
  };
}
