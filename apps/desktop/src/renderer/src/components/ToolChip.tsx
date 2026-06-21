import type { ToolSection } from "../../../shared/thread-tools";
import { ToolSectionIcon } from "./ToolSectionIcon";

interface ToolChipProps {
  label: string;
  section: ToolSection;
  toolId?: string;
}

export function ToolChip({ label, section, toolId }: ToolChipProps) {
  return (
    <span
      className={`tool-chip tool-chip-${section}`}
      contentEditable={false}
      aria-label={`Tool: ${label}`}
    >
      <span className="tool-chip-icon" aria-hidden>
        <ToolSectionIcon section={section} toolId={toolId} size={11} />
      </span>
      <span className="tool-chip-label">{label}</span>
    </span>
  );
}
