import { LayoutAlignRightIcon, PanelRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { sidenavRowHover } from "./main-workspace/constants";

type RightPanelToggleButtonProps = {
  expanded: boolean;
  className?: string;
  tabIndex?: number;
  onClick: () => void;
};

export function RightPanelToggleButton({
  expanded,
  className = "",
  tabIndex,
  onClick,
}: RightPanelToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={expanded ? "Close right panel" : "Open right panel"}
      aria-expanded={expanded}
      tabIndex={tabIndex}
      className={`app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-800 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover} ${className}`}
      onClick={onClick}
    >
      <HugeiconsIcon
        icon={expanded ? LayoutAlignRightIcon : PanelRightIcon}
        size={16}
        strokeWidth={1.7}
        aria-hidden
      />
    </button>
  );
}
