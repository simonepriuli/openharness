import { useEffect, useState } from "react";
import type { HarnessSettings } from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";
import { SettingsModelPicker } from "./SettingsModelPicker";

type WorkflowRunnerSettingsViewProps = {
  settings: HarnessSettings;
  saving: boolean;
  sessionKey: string | null;
  onSaveWorkflowSummarizationModel: (modelRef: string) => Promise<void>;
  embedded?: boolean;
};

export function WorkflowRunnerSettingsView({
  settings,
  saving,
  sessionKey,
  onSaveWorkflowSummarizationModel,
  embedded = false,
}: WorkflowRunnerSettingsViewProps) {
  const [summarizationModel, setSummarizationModel] = useState(settings.workflowSummarizationModel);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setSummarizationModel(settings.workflowSummarizationModel);
  }, [settings.workflowSummarizationModel]);

  const saveSelection = async (modelRef: string) => {
    setError(null);
    setSavedMessage(null);
    try {
      const next = modelRef.trim();
      await onSaveWorkflowSummarizationModel(next);
      setSavedMessage(
        next
          ? `Workflow summarization model set to ${next}.`
          : "Workflow summarization model reset to default.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow settings");
    }
  };

  return (
    <>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Workflows</h2>
          <p className="settings-muted settings-section-lead">
            Runner settings for summarizing completed workflow runs.
          </p>
        </>
      ) : null}

      <SettingsCard title="Run summarization model" padded={false} overflowVisible>
        <div className="settings-row">
          <div className="settings-row-text">
            <p className="settings-row-description">
              Model used to generate markdown summaries after a workflow finishes. Falls back to
              the chat title generation model when unset.
            </p>
            {error ? <p className="settings-error settings-row-feedback">{error}</p> : null}
            {savedMessage ? (
              <p className="settings-status settings-row-feedback">{savedMessage}</p>
            ) : null}
          </div>

          <SettingsModelPicker
            value={summarizationModel}
            onChange={(modelRef) => {
              setSummarizationModel(modelRef);
              void saveSelection(modelRef);
            }}
            sessionKey={sessionKey}
            disabled={saving}
            emptyLabel="Default (title generation model)"
            panelAriaLabel="Select workflow summarization model"
            listAriaLabel="Workflow summarization models"
          />
        </div>
      </SettingsCard>
    </>
  );
}
