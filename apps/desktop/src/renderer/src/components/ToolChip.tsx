import type { ToolSection } from "../../../shared/thread-tools";
import { ToolSectionIcon } from "./ToolSectionIcon";

interface ToolChipProps {
  label: string;
  section: ToolSection;
  toolId?: string;
  onRemove?: () => void;
}

export function ToolChip({ label, section, toolId, onRemove }: ToolChipProps) {
  return (
    <span
      className={`tool-chip tool-chip-${section}${onRemove ? " tool-chip-removable" : ""}`}
      contentEditable={false}
      aria-label={`Tool: ${label}`}
    >
      <span className="tool-chip-icon" aria-hidden>
        <ToolSectionIcon section={section} toolId={toolId} size={11} />
      </span>
      <span className="tool-chip-label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="tool-chip-remove"
          aria-label={`Remove ${label}`}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
