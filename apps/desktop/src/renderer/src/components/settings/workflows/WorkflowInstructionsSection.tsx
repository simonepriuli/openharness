import { useCallback, useEffect, useRef, useState } from "react";
import { THREAD_TOOL_CATALOG } from "../../../../../shared/thread-tools";
import { SettingsModelPicker } from "../SettingsModelPicker";
import { SlashToolInput } from "../../SlashToolInput";
import {
  createEmptyDraft,
  draftFromInstructions,
  serializeDraft,
  type ComposerSegment,
} from "../../../lib/composer-draft";

type WorkflowInstructionsSectionProps = {
  instructions: string;
  model: string;
  onInstructionsChange: (value: string) => void;
  onModelChange: (value: string) => void;
};

export function WorkflowInstructionsSection({
  instructions,
  model,
  onInstructionsChange,
  onModelChange,
}: WorkflowInstructionsSectionProps) {
  const [segments, setSegments] = useState<ComposerSegment[]>(() =>
    draftFromInstructions(instructions),
  );
  const instructionsRef = useRef(instructions);

  useEffect(() => {
    if (instructionsRef.current === instructions) return;
    instructionsRef.current = instructions;
    setSegments(draftFromInstructions(instructions));
  }, [instructions]);

  const handleSegmentsChange = useCallback(
    (nextSegments: ComposerSegment[]) => {
      setSegments(nextSegments);
      const serialized = serializeDraft(nextSegments);
      instructionsRef.current = serialized;
      onInstructionsChange(serialized);
    },
    [onInstructionsChange],
  );

  const loadStaticSlashItems = useCallback(async () => {
    try {
      const result = await window.harness.getStaticSlashCommands();
      if (result.items.length > 0) return result.items;
    } catch (err) {
      console.error("[workflow-instructions] static slash commands failed:", err);
    }
    return THREAD_TOOL_CATALOG.map((entry) => ({
      toolId: entry.id,
      label: entry.label,
      description: entry.description,
      section: entry.section,
      ...(entry.iconClassName ? { iconClassName: entry.iconClassName } : {}),
    }));
  }, []);

  return (
    <section className="workflow-detail-section">
      <h3 className="workflow-detail-label">Agent Instructions</h3>
      <div className="workflow-detail-card workflow-instructions-card">
        <div className="workflow-instructions-editor">
          <SlashToolInput
            segments={segments.length > 0 ? segments : createEmptyDraft()}
            onSegmentsChange={handleSegmentsChange}
            loadItems={loadStaticSlashItems}
            placeholder="Type / for tools…"
            className="workflow-instructions-input-wrap"
            inputClassName="workflow-instructions-input"
            minRows={12}
            maxHeight={480}
            prefixLayout="stacked"
            toolPickerEnabled
          />
        </div>
        <div className="workflow-instructions-footer">
          <SettingsModelPicker
            value={model}
            onChange={onModelChange}
            sessionKey={null}
            allowEmpty
            emptyLabel="Default model"
            emptyOptionLabel="Default model"
            panelAriaLabel="Select agent model"
            listAriaLabel="Agent models"
          />
        </div>
      </div>
    </section>
  );
}
