import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen01Icon,
  DocumentAttachmentIcon,
  LeftToRightListBulletIcon,
  SwarmIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SlashMenuItem } from "../../../shared/thread-tools";
import { ToolSectionIcon } from "./ToolSectionIcon";

type ComposerMode = "plan" | "swarm";
type FlyoutGroup = "skills" | "tools";

interface ComposerPlusControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  planMode: boolean;
  swarmMode: boolean;
  hideComposerModes: boolean;
  swarmAvailable: boolean;
  attachEnabled: boolean;
  slashMenuItems: SlashMenuItem[];
  loading: boolean;
  onSelectMode: (mode: ComposerMode) => void;
  onAttachFileOrFolder: () => void;
  onSelectTool: (item: SlashMenuItem) => void;
}

type FlyoutPosition = { top: number; left: number };

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7l3 3 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.5 2.5l3.5 3.5-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ComposerPlusControl({
  open,
  onOpenChange,
  disabled = false,
  planMode,
  swarmMode,
  hideComposerModes,
  swarmAvailable,
  attachEnabled,
  slashMenuItems,
  loading,
  onSelectMode,
  onAttachFileOrFolder,
  onSelectTool,
}: ComposerPlusControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const groupRowRefs = useRef(new Map<FlyoutGroup, HTMLDivElement>());
  const [hoveredGroup, setHoveredGroup] = useState<FlyoutGroup | null>(null);
  const [flyoutPosition, setFlyoutPosition] = useState<FlyoutPosition | null>(null);

  const showAttach = attachEnabled;

  const skillItems = useMemo(
    () => slashMenuItems.filter((item) => item.section === "skills"),
    [slashMenuItems],
  );
  const toolItems = useMemo(
    () => slashMenuItems.filter((item) => item.section === "tools"),
    [slashMenuItems],
  );

  const hoveredFlyoutItems =
    hoveredGroup === "skills" ? skillItems : hoveredGroup === "tools" ? toolItems : [];

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      setHoveredGroup(null);
      setFlyoutPosition(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!hoveredGroup || !menuRef.current) {
      setFlyoutPosition(null);
      return;
    }
    const row = groupRowRefs.current.get(hoveredGroup);
    if (!row) {
      setFlyoutPosition(null);
      return;
    }
    const margin = 8;
    const menuRect = menuRef.current.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const flyoutEl = flyoutRef.current;
    const flyoutWidth = flyoutEl?.offsetWidth ?? 280;
    const flyoutHeight = flyoutEl?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Prefer opening to the right of the menu; flip left if it would overflow.
    const rightViewportLeft = menuRect.right - 4;
    const fitsRight = rightViewportLeft + flyoutWidth <= viewportWidth - margin;
    const viewportLeft = fitsRight
      ? rightViewportLeft
      : Math.max(margin, menuRect.left + 4 - flyoutWidth);

    // Align to the hovered row, then clamp so the flyout stays within the window.
    let viewportTop = rowRect.top;
    if (flyoutHeight > 0) {
      const maxTop = viewportHeight - margin - flyoutHeight;
      viewportTop = Math.min(viewportTop, Math.max(margin, maxTop));
      viewportTop = Math.max(margin, viewportTop);
    }

    setFlyoutPosition({
      top: viewportTop - menuRect.top,
      left: viewportLeft - menuRect.left,
    });
  }, [hoveredGroup, open, skillItems.length, toolItems.length]);

  const setGroupRowRef = (group: FlyoutGroup) => (node: HTMLDivElement | null) => {
    if (node) {
      groupRowRefs.current.set(group, node);
    } else {
      groupRowRefs.current.delete(group);
    }
  };

  const close = () => onOpenChange(false);
  const dismissFlyout = () => setHoveredGroup(null);

  const showModes = !hideComposerModes;
  const showSkills = skillItems.length > 0 || loading;
  const showTools = toolItems.length > 0 || loading;

  return (
    <div className="composer-plus" ref={containerRef}>
      <button
        type="button"
        className={`composer-plus-btn${open ? " composer-plus-btn-open" : ""}`}
        title="Add modes, attachments, skills, and tools"
        aria-label="Open composer menu"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <IconPlus />
      </button>

      {open ? (
        <div ref={menuRef} className="composer-plus-menu" role="menu">
          {showAttach ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="composer-plus-menu-item"
                onMouseEnter={dismissFlyout}
                onClick={() => {
                  onAttachFileOrFolder();
                  close();
                }}
              >
                <span className="composer-plus-menu-item-icon" aria-hidden>
                  <HugeiconsIcon icon={DocumentAttachmentIcon} size={14} strokeWidth={1.75} />
                </span>
                <span className="composer-plus-menu-item-label">File/Folder</span>
              </button>
              {showModes ? (
                <div className="composer-plus-menu-divider" role="separator" onMouseEnter={dismissFlyout} />
              ) : (showSkills || showTools) ? (
                <div className="composer-plus-menu-divider" role="separator" onMouseEnter={dismissFlyout} />
              ) : null}
            </>
          ) : null}

          {showModes ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="composer-plus-menu-item"
                onMouseEnter={dismissFlyout}
                onClick={() => {
                  onSelectMode("plan");
                  close();
                }}
              >
                <span className="composer-plus-menu-item-icon" aria-hidden>
                  <HugeiconsIcon icon={LeftToRightListBulletIcon} size={14} strokeWidth={1.75} />
                </span>
                <span className="composer-plus-menu-item-label">Plan</span>
                {planMode ? (
                  <span className="composer-plus-menu-check" aria-hidden>
                    <IconCheck />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                role="menuitem"
                className="composer-plus-menu-item"
                disabled={!swarmAvailable}
                onMouseEnter={dismissFlyout}
                onClick={() => {
                  if (!swarmAvailable) return;
                  onSelectMode("swarm");
                  close();
                }}
              >
                <span className="composer-plus-menu-item-icon" aria-hidden>
                  <HugeiconsIcon icon={SwarmIcon} size={14} strokeWidth={1.75} />
                </span>
                <span className="composer-plus-menu-item-label">Swarm</span>
                {swarmMode ? (
                  <span className="composer-plus-menu-check" aria-hidden>
                    <IconCheck />
                  </span>
                ) : null}
              </button>
              {(showSkills || showTools) ? (
                <div className="composer-plus-menu-divider" role="separator" onMouseEnter={dismissFlyout} />
              ) : null}
            </>
          ) : null}

          {showSkills ? (
            <div
              className="composer-plus-menu-group"
              onMouseEnter={() => setHoveredGroup("skills")}
            >
              <div
                ref={setGroupRowRef("skills")}
                className={`composer-plus-menu-item composer-plus-menu-item-has-submenu${
                  hoveredGroup === "skills" ? " composer-plus-menu-item-active" : ""
                }`}
                role="menuitem"
                aria-haspopup="menu"
              >
                <span className="composer-plus-menu-item-icon" aria-hidden>
                  <HugeiconsIcon icon={BookOpen01Icon} size={14} strokeWidth={1.75} />
                </span>
                <span className="composer-plus-menu-item-label">Skills</span>
                <span className="composer-plus-menu-chevron" aria-hidden>
                  <IconChevronRight />
                </span>
              </div>
            </div>
          ) : null}

          {showTools ? (
            <div
              className="composer-plus-menu-group"
              onMouseEnter={() => setHoveredGroup("tools")}
            >
              <div
                ref={setGroupRowRef("tools")}
                className={`composer-plus-menu-item composer-plus-menu-item-has-submenu${
                  hoveredGroup === "tools" ? " composer-plus-menu-item-active" : ""
                }`}
                role="menuitem"
                aria-haspopup="menu"
              >
                <span className="composer-plus-menu-item-icon" aria-hidden>
                  <HugeiconsIcon icon={Wrench01Icon} size={14} strokeWidth={1.75} />
                </span>
                <span className="composer-plus-menu-item-label">Tools</span>
                <span className="composer-plus-menu-chevron" aria-hidden>
                  <IconChevronRight />
                </span>
              </div>
            </div>
          ) : null}

          {hoveredGroup && hoveredFlyoutItems.length > 0 ? (
            <div
              ref={flyoutRef}
              className="composer-plus-flyout"
              style={{
                top: flyoutPosition?.top ?? 0,
                left: flyoutPosition?.left ?? 0,
                visibility: flyoutPosition ? "visible" : "hidden",
              }}
              role="menu"
              onMouseEnter={() => setHoveredGroup(hoveredGroup)}
            >
              {hoveredFlyoutItems.map((item) => (
                <button
                  key={item.toolId}
                  type="button"
                  role="menuitem"
                  className={`composer-plus-flyout-item composer-plus-flyout-item-described${
                    hoveredGroup === "tools" ? " composer-plus-flyout-item-with-icon" : ""
                  }`}
                  onClick={() => {
                    onSelectTool(item);
                    close();
                  }}
                >
                  {hoveredGroup === "tools" ? (
                    <span className="composer-plus-flyout-item-icon" aria-hidden>
                      <ToolSectionIcon section={item.section} toolId={item.toolId} size={14} />
                    </span>
                  ) : null}
                  <span className="composer-plus-flyout-item-copy">
                    <span className="composer-plus-flyout-item-name">{item.label}</span>
                    {item.description ? (
                      <span className="composer-plus-flyout-item-description">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {loading && skillItems.length === 0 && toolItems.length === 0 ? (
            <div className="composer-plus-menu-empty">Loading…</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
