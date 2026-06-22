import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => minute);

type WorkflowScheduleMinutePickerProps = {
  value: number;
  onChange: (minute: number) => void;
};

export function WorkflowScheduleMinutePicker({
  value,
  onChange,
}: WorkflowScheduleMinutePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelMaxHeight = 200;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < panelMaxHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.min(panelMaxHeight, openAbove ? spaceAbove : spaceBelow);

    setPanelStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      top: openAbove ? rect.top - gap - maxHeight : rect.bottom + gap,
      maxHeight,
      zIndex: 60,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLElement>(
      '[data-minute-option][aria-selected="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="workflow-schedule-minute-picker">
      <button
        ref={triggerRef}
        type="button"
        className="workflow-schedule-pill workflow-schedule-pill-minute workflow-schedule-minute-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Minute"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="workflow-schedule-pill-prefix">:</span>
        <span>{String(value).padStart(2, "0")}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          strokeWidth={2}
          className="workflow-schedule-pill-chevron"
          aria-hidden
        />
      </button>

      {open ? (
        <div className="workflow-schedule-minute-panel" style={panelStyle}>
          <ul
            ref={listRef}
            className="workflow-schedule-minute-list"
            role="listbox"
            aria-label="Minute"
          >
            {MINUTE_OPTIONS.map((minute) => {
              const selected = minute === value;
              return (
                <li key={minute} role="none">
                  <button
                    type="button"
                    role="option"
                    data-minute-option
                    aria-selected={selected}
                    className={`workflow-schedule-minute-option${
                      selected ? " workflow-schedule-minute-option-selected" : ""
                    }`}
                    onClick={() => {
                      onChange(minute);
                      setOpen(false);
                    }}
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
