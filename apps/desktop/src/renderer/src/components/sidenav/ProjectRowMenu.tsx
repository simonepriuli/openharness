import { ArchiveXIcon, Delete02Icon, Link01Icon, LinkSquare02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { sidenavRowHover } from "../main-workspace/constants";

type ProjectRowMenuProps = {
  projectName: string;
  projectCwd: string;
  githubConnected?: boolean;
  showGithubActions?: boolean;
  onArchiveAllChats: () => void;
  onRemoveProject: () => void;
  onConnectGithub: () => void;
  onDisconnectGithub: () => void;
};

function ProjectRowMenuInner({
  projectName,
  githubConnected = false,
  showGithubActions = true,
  onArchiveAllChats,
  onRemoveProject,
  onConnectGithub,
  onDisconnectGithub,
}: ProjectRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      setPanelEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

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
      className={`relative shrink-0 ${open ? "flex" : "hidden group-hover:flex"}`}
    >
      <button
        type="button"
        aria-label={`${projectName} options`}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-slate-700 dark:text-neutral-400 dark:hover:text-slate-200 ${sidenavRowHover}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.6} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={`${projectName} options`}
          className={`project-row-menu-shell workspace-panel-shell ${panelEntered ? "is-open" : "is-closed"} absolute right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-popover)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]`}
        >
          <div className="workspace-panel project-row-menu-panel">
            <div className="workspace-panel-menu">
              {showGithubActions ? (
                githubConnected ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="workspace-panel-item"
                    onClick={(event) => {
                      event.stopPropagation();
                      close();
                      onDisconnectGithub();
                    }}
                  >
                    <HugeiconsIcon icon={LinkSquare02Icon} size={15} strokeWidth={1.75} aria-hidden />
                    <span className="workspace-panel-item-label">Disconnect GitHub</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="workspace-panel-item"
                    onClick={(event) => {
                      event.stopPropagation();
                      close();
                      onConnectGithub();
                    }}
                  >
                    <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.75} aria-hidden />
                    <span className="workspace-panel-item-label">Connect GitHub repository…</span>
                  </button>
                )
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                  onArchiveAllChats();
                }}
              >
                <HugeiconsIcon icon={ArchiveXIcon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-item-label">Archive all chats</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                  onRemoveProject();
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-item-label">Remove project</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ProjectRowMenu = memo(ProjectRowMenuInner);
