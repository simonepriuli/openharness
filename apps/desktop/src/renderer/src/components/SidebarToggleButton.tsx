import { LayoutAlignLeftIcon, PanelLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type SidebarToggleButtonProps = {
  expanded: boolean;
  className?: string;
  tabIndex?: number;
  onClick: () => void;
};

export function SidebarToggleButton({
  expanded,
  className = "",
  tabIndex,
  onClick,
}: SidebarToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={expanded ? "Close sidebar" : "Open sidebar"}
      aria-expanded={expanded}
      tabIndex={tabIndex}
      className={`app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800 ${className}`}
      onClick={onClick}
    >
      <HugeiconsIcon
        icon={expanded ? LayoutAlignLeftIcon : PanelLeftIcon}
        size={16}
        strokeWidth={1.7}
        aria-hidden
      />
    </button>
  );
}
