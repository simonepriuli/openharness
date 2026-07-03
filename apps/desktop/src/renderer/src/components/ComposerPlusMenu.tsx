import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen01Icon,
  Bug01Icon,
  DocumentAttachmentIcon,
  LeftToRightListBulletIcon,
  SwarmIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SlashMenuItem } from "../../../shared/thread-tools";
import { ToolSectionIcon } from "./ToolSectionIcon";

type ComposerMode = "plan" | "swarm" | "debug";
type FlyoutGroup = "skills" | "tools";

type FlyoutTarget =
  | { kind: "group"; group: FlyoutGroup }
  | { kind: "mode"; mode: ComposerMode };

const COMPOSER_MODE_INFO: Record<ComposerMode, { title: string; description: string }> = {
  plan: {
    title: "Plan mode",
    description:
      "Interview, explore read-only, and write a plan document before the agent edits code.",
  },
  swarm: {
    title: "Swarm mode",
    description:
      "Delegate substantial multi-step work to parallel sub-agents for faster completion.",
  },
  debug: {
    title: "Debug mode",
    description:
      "Pinpoints root cause with repro steps, logs, and stack traces before applying fixes.",
  },
};

interface ComposerPlusControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  planMode: boolean;
  swarmMode: boolean;
  debugMode: boolean;
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
  debugMode,
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
  const modeRowRefs = useRef(new Map<ComposerMode, HTMLButtonElement>());
  const [hoveredFlyout, setHoveredFlyout] = useState<FlyoutTarget | null>(null);
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
    hoveredFlyout?.kind === "group" && hoveredFlyout.group === "skills"
      ? skillItems
      : hoveredFlyout?.kind === "group" && hoveredFlyout.group === "tools"
        ? toolItems
        : [];

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
      setHoveredFlyout(null);
      setFlyoutPosition(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!hoveredFlyout || !menuRef.current) {
      setFlyoutPosition(null);
      return;
    }
    const row =
      hoveredFlyout.kind === "mode"
        ? modeRowRefs.current.get(hoveredFlyout.mode)
        : groupRowRefs.current.get(hoveredFlyout.group);
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
  }, [hoveredFlyout, open, skillItems.length, toolItems.length]);

  const setGroupRowRef = (group: FlyoutGroup) => (node: HTMLDivElement | null) => {
    if (node) {
      groupRowRefs.current.set(group, node);
    } else {
      groupRowRefs.current.delete(group);
    }
  };

  const setModeRowRef = (mode: ComposerMode) => (node: HTMLButtonElement | null) => {
    if (node) {
      modeRowRefs.current.set(mode, node);
    } else {
      modeRowRefs.current.delete(mode);
    }
  };

  const close = () => onOpenChange(false);
  const dismissFlyout = () => setHoveredFlyout(null);

  const isModeHovered = (mode: ComposerMode) =>
    hoveredFlyout?.kind === "mode" && hoveredFlyout.mode === mode;

  const renderModeRow = (
    mode: ComposerMode,
    options: {
      icon: typeof LeftToRightListBulletIcon;
      label: string;
      active: boolean;
      disabled?: boolean;
      onSelect: () => void;
    },
  ) => (
    <button
      key={mode}
      ref={setModeRowRef(mode)}
      type="button"
      role="menuitem"
      className={`composer-plus-menu-item${
        isModeHovered(mode) ? " composer-plus-menu-item-active" : ""
      }`}
      disabled={options.disabled}
      onMouseEnter={() => setHoveredFlyout({ kind: "mode", mode })}
      onClick={() => {
        if (options.disabled) return;
        options.onSelect();
        close();
      }}
    >
      <span className="composer-plus-menu-item-icon" aria-hidden>
        <HugeiconsIcon icon={options.icon} size={14} strokeWidth={1.75} />
      </span>
      <span className="composer-plus-menu-item-label">{options.label}</span>
      {options.active ? (
        <span className="composer-plus-menu-check" aria-hidden>
          <IconCheck />
        </span>
      ) : null}
    </button>
  );

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
              {renderModeRow("plan", {
                icon: LeftToRightListBulletIcon,
                label: "Plan",
                active: planMode,
                onSelect: () => onSelectMode("plan"),
              })}
              {renderModeRow("swarm", {
                icon: SwarmIcon,
                label: "Swarm",
                active: swarmMode,
                disabled: !swarmAvailable,
                onSelect: () => onSelectMode("swarm"),
              })}
              {renderModeRow("debug", {
                icon: Bug01Icon,
                label: "Debug",
                active: debugMode,
                onSelect: () => onSelectMode("debug"),
              })}
              {(showSkills || showTools) ? (
                <div className="composer-plus-menu-divider" role="separator" onMouseEnter={dismissFlyout} />
              ) : null}
            </>
          ) : null}

          {showSkills ? (
            <div
              className="composer-plus-menu-group"
              onMouseEnter={() => setHoveredFlyout({ kind: "group", group: "skills" })}
            >
              <div
                ref={setGroupRowRef("skills")}
                className={`composer-plus-menu-item composer-plus-menu-item-has-submenu${
                  hoveredFlyout?.kind === "group" && hoveredFlyout.group === "skills"
                    ? " composer-plus-menu-item-active"
                    : ""
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
              onMouseEnter={() => setHoveredFlyout({ kind: "group", group: "tools" })}
            >
              <div
                ref={setGroupRowRef("tools")}
                className={`composer-plus-menu-item composer-plus-menu-item-has-submenu${
                  hoveredFlyout?.kind === "group" && hoveredFlyout.group === "tools"
                    ? " composer-plus-menu-item-active"
                    : ""
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

          {hoveredFlyout?.kind === "mode" ? (
            <div
              ref={flyoutRef}
              className="composer-plus-flyout composer-plus-mode-flyout"
              style={{
                top: flyoutPosition?.top ?? 0,
                left: flyoutPosition?.left ?? 0,
                visibility: flyoutPosition ? "visible" : "hidden",
              }}
              role="tooltip"
              onMouseEnter={() => setHoveredFlyout(hoveredFlyout)}
            >
              <p className="composer-plus-mode-flyout-title">
                {COMPOSER_MODE_INFO[hoveredFlyout.mode].title}
              </p>
              <p className="composer-plus-mode-flyout-description">
                {COMPOSER_MODE_INFO[hoveredFlyout.mode].description}
              </p>
            </div>
          ) : null}

          {hoveredFlyout?.kind === "group" && hoveredFlyoutItems.length > 0 ? (
            <div
              ref={flyoutRef}
              className="composer-plus-flyout"
              style={{
                top: flyoutPosition?.top ?? 0,
                left: flyoutPosition?.left ?? 0,
                visibility: flyoutPosition ? "visible" : "hidden",
              }}
              role="menu"
              onMouseEnter={() => setHoveredFlyout(hoveredFlyout)}
            >
              {hoveredFlyoutItems.map((item) => (
                <button
                  key={item.toolId}
                  type="button"
                  role="menuitem"
                  className={`composer-plus-flyout-item composer-plus-flyout-item-described${
                    hoveredFlyout.group === "tools" ? " composer-plus-flyout-item-with-icon" : ""
                  }`}
                  onClick={() => {
                    onSelectTool(item);
                    close();
                  }}
                >
                  {hoveredFlyout.group === "tools" ? (
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
