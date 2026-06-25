import { ArrowDown01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { OpenWorkbookWithTarget, WorkbookOpenWithOption } from "../../../../preload/api";

type WorkbookOpenInButtonProps = {
  cwd: string | null;
  workbookPath?: string;
};

function preferredApp(apps: WorkbookOpenWithOption[]): WorkbookOpenWithOption | undefined {
  return apps[0];
}

function AppIcon() {
  return (
    <span className="workbook-open-in-icon-fallback" aria-hidden>
      <HugeiconsIcon icon={File02Icon} size={14} strokeWidth={1.8} />
    </span>
  );
}

export function WorkbookOpenInButton({ cwd, workbookPath }: WorkbookOpenInButtonProps) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<WorkbookOpenWithOption[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const enabled = Boolean(cwd && workbookPath);
  const primaryApp = useMemo(() => preferredApp(apps), [apps]);
  const showChevron = apps.length > 1;

  useEffect(() => {
    let cancelled = false;
    void window.harness.listWorkbookOpenWithApps().then((options) => {
      if (!cancelled) {
        setApps(options);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateMenuPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      left: rect.right,
      width: Math.max(rect.width, 180),
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open, updateMenuPosition]);

  const openWith = useCallback(
    async (target: OpenWorkbookWithTarget) => {
      if (!cwd || !workbookPath) return;
      close();
      const result = await window.harness.openWorkbookWith({
        cwd,
        relativePath: workbookPath,
        target,
      });
      if (!result.ok) {
        console.error("[WorkbookOpenInButton]", result.error);
      }
    },
    [close, cwd, workbookPath],
  );

  const toggleMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!showChevron) return;
      setOpen((value) => {
        const next = !value;
        if (next) {
          requestAnimationFrame(() => updateMenuPosition());
        }
        return next;
      });
    },
    [showChevron, updateMenuPosition],
  );

  if (apps.length === 0) {
    return null;
  }

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="workbook-open-in-menu"
            role="menu"
            aria-label="Open spreadsheet with"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              transform: "translateX(-100%)",
              zIndex: 1000,
            }}
          >
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                className="workbook-open-in-menu-item"
                role="menuitem"
                disabled={!enabled}
                onClick={() => void openWith(app.id)}
              >
                <AppIcon />
                <span>{app.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="workbook-open-in app-region-no-drag">
      <div
        className={`workbook-open-in-button${!enabled ? " workbook-open-in-button-disabled" : ""}`}
        title={enabled ? undefined : "Select a spreadsheet to open externally"}
      >
        <button
          type="button"
          className="workbook-open-in-main app-region-no-drag"
          disabled={!enabled || !primaryApp}
          aria-label={
            primaryApp ? `Open in ${primaryApp.label}` : "Open spreadsheet in external app"
          }
          onClick={(event) => {
            event.stopPropagation();
            if (!primaryApp) return;
            void openWith(primaryApp.id);
          }}
        >
          <AppIcon />
          <span>Open in</span>
        </button>
        {showChevron ? (
          <>
            <span className="workbook-open-in-divider" aria-hidden />
            <button
              type="button"
              className="workbook-open-in-chevron app-region-no-drag"
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="Choose app to open spreadsheet"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={toggleMenu}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
            </button>
          </>
        ) : null}
      </div>
      {menu}
    </div>
  );
}
