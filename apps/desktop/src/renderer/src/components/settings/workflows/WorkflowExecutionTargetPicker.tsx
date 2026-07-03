import { useEffect, useRef } from "react";
import { useClampPopoverToViewport } from "../../../hooks/useClampPopoverToViewport";

export type WorkflowExecutionTarget = "local" | "cloud" | "auto";

const EXECUTION_TARGET_OPTIONS: Array<{
  value: WorkflowExecutionTarget;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Auto (prefer cloud)",
    description: "Use cloud when available, otherwise run locally",
  },
  {
    value: "cloud",
    label: "Cloud",
    description: "Always run in the cloud",
  },
  {
    value: "local",
    label: "Local",
    description: "Run on a configured org runner",
  },
];

export function executionTargetLabel(value: WorkflowExecutionTarget): string {
  return EXECUTION_TARGET_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

type WorkflowExecutionTargetPickerProps = {
  open: boolean;
  value: WorkflowExecutionTarget;
  onClose: () => void;
  onChange: (value: WorkflowExecutionTarget) => void;
};

export function WorkflowExecutionTargetPicker({
  open,
  value,
  onClose,
  onChange,
}: WorkflowExecutionTargetPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useClampPopoverToViewport(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="workflow-repo-picker workflow-execution-target-picker"
      role="dialog"
      aria-label="Select execution target"
    >
      <div className="workflow-repo-picker-scroll">
        <section className="workflow-repo-picker-section">
          {EXECUTION_TARGET_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`workflow-repo-picker-item workflow-execution-target-picker-item${
                  selected ? " workflow-repo-picker-item-selected" : ""
                }`}
                onClick={() => {
                  onChange(option.value);
                  onClose();
                }}
              >
                <span className="workflow-execution-target-picker-item-text">
                  <span>{option.label}</span>
                  <span className="workflow-execution-target-picker-item-description">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}
