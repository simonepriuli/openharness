import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleLoader } from "./BrailleLoader";

type WorkflowComposerPanelProps = {
  title: string;
  isStreaming: boolean;
  error?: string | null;
};

export function WorkflowComposerPanel({
  title,
  isStreaming,
  error,
}: WorkflowComposerPanelProps) {
  const statusLabel = error ? "Failed" : isStreaming ? "Running" : "Completed";

  return (
    <div className="workflow-composer">
      <div className="workflow-composer-panel" role="status" aria-live="polite">
        <div className="workflow-composer-panel-main">
          <div className="workflow-composer-panel-icon" aria-hidden>
            <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={1.7} />
          </div>
          <div className="workflow-composer-panel-copy">
            <div className="workflow-composer-panel-heading">
              <span className="workflow-composer-panel-badge">Workflow</span>
              <span
                className={`workflow-composer-panel-status workflow-composer-panel-status-${error ? "failed" : isStreaming ? "running" : "done"}`}
              >
                {isStreaming ? (
                  <BrailleLoader className="workflow-composer-braille" decorative />
                ) : null}
                {statusLabel}
              </span>
            </div>
            <p className="workflow-composer-panel-title">{title}</p>
            <p className="workflow-composer-panel-hint">
              {error
                ? "This workflow run finished with an error. Edit the workflow in Settings to try again."
                : isStreaming
                  ? "OpenHarness is running this workflow locally. You can watch progress above."
                  : "This is a read-only workflow run. Edit or re-run it from Settings → Workflows."}
            </p>
            {error ? <p className="workflow-composer-panel-error">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
