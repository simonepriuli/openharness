import { ArrowDown01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { OfficeOpenWithOption, OpenOfficeWithTarget } from "../../../../preload/api";
import { officeFileKindFromPath } from "@renderer/lib/conversation-runtime";

type OfficeOpenInButtonProps = {
  cwd: string | null;
  documentPath?: string;
};

function preferredApp(apps: OfficeOpenWithOption[]): OfficeOpenWithOption | undefined {
  return apps[0];
}

function AppIcon() {
  return (
    <span className="workbook-open-in-icon-fallback" aria-hidden>
      <HugeiconsIcon icon={File02Icon} size={14} strokeWidth={1.8} />
    </span>
  );
}

export function OfficeOpenInButton({ cwd, documentPath }: OfficeOpenInButtonProps) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<OfficeOpenWithOption[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fileKind = documentPath ? officeFileKindFromPath(documentPath) : null;
  const openableKind = fileKind === "docx" || fileKind === "xlsx" ? fileKind : null;
  const enabled = Boolean(cwd && documentPath && openableKind);
  const primaryApp = useMemo(() => preferredApp(apps), [apps]);
  const showChevron = apps.length > 1;
  const documentLabel = openableKind === "docx" ? "document" : "spreadsheet";

  useEffect(() => {
    if (!openableKind) {
      setApps([]);
      return;
    }
    let cancelled = false;
    void window.harness
      .listOfficeOpenWithApps({ kind: openableKind })
      .then((options) => {
        if (!cancelled) {
          setApps(options);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openableKind]);

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
    async (target: OpenOfficeWithTarget) => {
      if (!cwd || !documentPath) return;
      close();
      const result = await window.harness.openOfficeWith({
        cwd,
        relativePath: documentPath,
        target,
      });
      if (!result.ok) {
        console.error("[OfficeOpenInButton]", result.error);
      }
    },
    [close, cwd, documentPath],
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
            aria-label={`Open ${documentLabel} with`}
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
        title={enabled ? undefined : `Select a ${documentLabel} to open externally`}
      >
        <button
          type="button"
          className="workbook-open-in-main app-region-no-drag"
          disabled={!enabled || !primaryApp}
          aria-label={
            primaryApp ? `Open in ${primaryApp.label}` : `Open ${documentLabel} in external app`
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
              aria-label={`Choose app to open ${documentLabel}`}
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

/** @deprecated Use OfficeOpenInButton */
export function WorkbookOpenInButton({
  cwd,
  workbookPath,
}: {
  cwd: string | null;
  workbookPath?: string;
}) {
  return <OfficeOpenInButton cwd={cwd} documentPath={workbookPath} />;
}
