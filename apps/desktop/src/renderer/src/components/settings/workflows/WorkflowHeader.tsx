import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { SettingsToggle } from "../SettingsToggle";
import { WorkflowRepoPicker } from "./WorkflowRepoPicker";

type WorkflowHeaderProps = {
  name: string;
  enabled: boolean;
  owner: string;
  repo: string;
  projectPath: string;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  onNameChange: (name: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRepoChange: (owner: string, repo: string) => void;
  onProjectPathChange: (projectPath: string) => void;
};

export function WorkflowHeader({
  name,
  enabled,
  owner,
  repo,
  projectPath,
  saving,
  canSave,
  onSave,
  onNameChange,
  onToggleEnabled,
  onRepoChange,
  onProjectPathChange,
}: WorkflowHeaderProps) {
  const [repoOpen, setRepoOpen] = useState(false);

  const hasRepo = Boolean(owner && repo);
  const folderLabel = projectPath
    ? projectPath.split("/").filter(Boolean).pop() ?? projectPath
    : "Select folder";

  return (
    <header className="workflow-detail-header">
      <div className="workflow-detail-header-top">
        <input
          className="workflow-detail-title-input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Workflow name"
        />
        <button
          type="button"
          className="settings-button settings-button-secondary settings-button-sm shrink-0"
          disabled={saving || !canSave}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="workflow-detail-meta">
        <div className="workflow-detail-toggle">
          <SettingsToggle
            label={enabled ? "Active" : "Inactive"}
            checked={enabled}
            onChange={onToggleEnabled}
          />
          <span>{enabled ? "Active" : "Inactive"}</span>
        </div>

        <span className="workflow-detail-meta-separator" aria-hidden />

        <div className="workflow-detail-repo">
          <button
            type="button"
            className={`workflow-detail-select-trigger${
              hasRepo
                ? " workflow-detail-select-trigger-selected"
                : " workflow-detail-select-trigger-placeholder"
            }`}
            aria-expanded={repoOpen}
            onClick={() => setRepoOpen((open) => !open)}
          >
            <span className="workflow-detail-select-trigger-label">
              {hasRepo ? repo : "Select repository"}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={14}
              strokeWidth={1.8}
              className="workflow-detail-select-trigger-icon"
              aria-hidden
            />
          </button>
          <WorkflowRepoPicker
            open={repoOpen}
            owner={owner}
            repo={repo}
            onClose={() => setRepoOpen(false)}
            onRepoChange={onRepoChange}
          />
        </div>

        <span className="workflow-detail-meta-separator" aria-hidden />

        <button
          type="button"
          className={`workflow-detail-select-trigger${
            projectPath
              ? " workflow-detail-select-trigger-selected"
              : " workflow-detail-select-trigger-placeholder"
          }`}
          title={projectPath || undefined}
          onClick={() => {
            void window.harness.pickDirectory().then((result) => {
              if (!result.canceled) onProjectPathChange(result.cwd);
            });
          }}
        >
          <span className="workflow-detail-select-trigger-label">{folderLabel}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.8}
            className="workflow-detail-select-trigger-icon"
            aria-hidden
          />
        </button>
      </div>
    </header>
  );
}
