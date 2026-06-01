import { FolderOpenIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  iconPrimary,
  panelRow,
  popoverSurface,
  rowHover,
  textHeaderLabel,
  textPrimary,
} from "../main-workspace/constants";

const popoverContent = "flex flex-col gap-2 px-2 pb-2 pt-2";
const panelRowInteractive = `${panelRow} rounded-lg text-xs font-medium ${textPrimary} ${rowHover}`;

type SidenavFooterProps = {
  onOpenFolder: () => void;
};

export function SidenavFooter({ onOpenFolder }: SidenavFooterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className="app-region-no-drag sidenav-footer relative shrink-0 bg-transparent px-1.5 pb-2 pt-1"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-8 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${textPrimary} ${rowHover}`}
        onClick={() => setOpen((v) => !v)}
      >
        <HugeiconsIcon
          icon={Settings01Icon}
          size={16}
          strokeWidth={1.5}
          className={`shrink-0 ${iconPrimary}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">Workspace</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Workspace actions"
          className={`absolute bottom-full left-2 right-2 z-30 mb-1 overflow-hidden ${popoverSurface}`}
        >
          <div className={popoverContent}>
            <div className={`${panelRow} text-xs font-medium ${textHeaderLabel}`}>
              <span className="min-w-0 truncate">Projects</span>
            </div>

            <button
              type="button"
              className={`${panelRowInteractive} text-left`}
              onClick={() => {
                close();
                onOpenFolder();
              }}
            >
              <HugeiconsIcon
                icon={FolderOpenIcon}
                size={16}
                strokeWidth={1.5}
                className={`shrink-0 ${iconPrimary}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">Open folder…</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
