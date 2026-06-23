import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type RefObject } from "react";
import {
  AiMagicIcon,
  Bug01Icon,
  FileEditIcon,
  Idea01Icon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { positionToolbarAboveEnd } from "../../lib/code-selection";
import {
  SELECTION_ACTIONS,
  type SelectionActionId,
} from "../../lib/selection-action-messages";
import type { SelectionToolbarState } from "../../hooks/useCodeSelectionToolbar";

const ACTION_ICONS: Record<SelectionActionId, IconSvgElement> = {
  explain: Idea01Icon,
  "bug-discovery": Bug01Icon,
  refactor: AiMagicIcon,
  "add-tests": TestTube01Icon,
  document: FileEditIcon,
};

type SelectionActionToolbarProps = {
  toolbarRef: RefObject<HTMLDivElement | null>;
  state: SelectionToolbarState;
  onAction: (actionId: SelectionActionId) => void;
};

export function SelectionActionToolbar({
  toolbarRef,
  state,
  onAction,
}: SelectionActionToolbarProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const { width, height } = toolbar.getBoundingClientRect();
    const next = positionToolbarAboveEnd(
      state.rangeRect,
      { width, height },
      state.containerRect,
    );
    setPosition(next);
    setIsPositioned(true);
  }, [state.rangeRect, state.containerRect, toolbarRef]);

  return createPortal(
    <div
      ref={toolbarRef}
      className="selection-action-toolbar workspace-panel-shell is-open"
      style={{
        top: position.top,
        left: position.left,
        visibility: isPositioned ? "visible" : "hidden",
      }}
      role="toolbar"
      aria-label="Code selection actions"
      onMouseDown={(event) => event.preventDefault()}
    >
      {SELECTION_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="selection-action-toolbar-button"
          onClick={() => onAction(action.id)}
        >
          <HugeiconsIcon
            icon={ACTION_ICONS[action.id]}
            size={15}
            className="selection-action-toolbar-icon"
            aria-hidden
          />
          <span>{action.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
