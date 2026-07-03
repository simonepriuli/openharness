import { useCallback, useEffect, useRef, useState } from "react";
import { workflowToggleKeyForToolId } from "../../../../../shared/workflow-slash-tools";
import type { WorkflowTools } from "../../../../../preload/api";
import type { SlashMenuItem } from "../../../../../shared/thread-tools";
import { SettingsModelPicker } from "../SettingsModelPicker";
import { LexicalComposerInput } from "../../lexical/LexicalComposerInput";
import {
  createEmptyDraft,
  draftFromInstructions,
  serializeDraft,
  type ComposerSegment,
  type ToolSegment,
} from "../../../lib/composer-draft";
import { getTrailingEditorText } from "../../../lib/lexical-draft";

type WorkflowInstructionsSectionProps = {
  instructions: string;
  model: string;
  tools: WorkflowTools;
  onInstructionsChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onToolsChange: (tools: WorkflowTools) => void;
};

export function WorkflowInstructionsSection({
  instructions,
  model,
  tools,
  onInstructionsChange,
  onModelChange,
  onToolsChange,
}: WorkflowInstructionsSectionProps) {
  const [segments, setSegments] = useState<ComposerSegment[]>(() =>
    draftFromInstructions(instructions),
  );
  const [staticSlashItems, setStaticSlashItems] = useState<SlashMenuItem[]>([]);
  const instructionsRef = useRef(instructions);
  const menuPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void window.harness
      .getStaticSlashCommands()
      .then((result) => {
        if (!cancelled) setStaticSlashItems(result.items);
      })
      .catch((err) => {
        console.error("[workflow-instructions] static slash preload failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleSelectTool = useCallback(
    (item: SlashMenuItem) => {
      const toggleKey = workflowToggleKeyForToolId(item.toolId);
      if (!toggleKey || tools[toggleKey]) return;
      onToolsChange({ ...tools, [toggleKey]: true });
    },
    [onToolsChange, tools],
  );

  const handleRemoveTool = useCallback(
    (segment: ToolSegment) => {
      const toggleKey = workflowToggleKeyForToolId(segment.toolId);
      if (!toggleKey || !tools[toggleKey]) return;
      const stillUsed = segments.some(
        (other) =>
          other.type === "tool" &&
          other.id !== segment.id &&
          workflowToggleKeyForToolId(other.toolId) === toggleKey,
      );
      if (stillUsed) return;
      onToolsChange({ ...tools, [toggleKey]: false });
    },
    [onToolsChange, tools, segments],
  );

  const loadStaticSlashItems = useCallback(async () => {
    try {
      const result = await window.harness.getStaticSlashCommands();
      return result.items;
    } catch (err) {
      console.error("[workflow-instructions] static slash commands failed:", err);
      return [];
    }
  }, []);

  const trailingText = getTrailingEditorText(segments);

  return (
    <section className="workflow-detail-section">
      <h3 className="workflow-detail-label">Agent Instructions</h3>
      <div className="workflow-detail-card workflow-instructions-card">
        <div className="workflow-instructions-editor" ref={menuPortalRef}>
          <LexicalComposerInput
            segments={segments.length > 0 ? segments : createEmptyDraft()}
            onSegmentsChange={handleSegmentsChange}
            loadItems={loadStaticSlashItems}
            cachedSlashItems={staticSlashItems}
            onSelectTool={handleSelectTool}
            onRemoveTool={handleRemoveTool}
            placeholder={!trailingText ? "Type / for tools…" : undefined}
            className="workflow-instructions-input-wrap"
            inputClassName="workflow-instructions-input"
            minRows={12}
            maxHeight={480}
            toolPickerEnabled
            mentionEnabled={false}
            menuPortalRef={menuPortalRef}
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
