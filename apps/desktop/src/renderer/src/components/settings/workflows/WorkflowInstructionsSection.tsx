import { SettingsModelPicker } from "../SettingsModelPicker";

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
  return (
    <section className="workflow-detail-section">
      <h3 className="workflow-detail-label">Agent Instructions</h3>
      <div className="workflow-detail-card workflow-instructions-card">
        <textarea
          className="workflow-instructions-input"
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Type @ for tools, / for commands…"
          rows={12}
        />
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
