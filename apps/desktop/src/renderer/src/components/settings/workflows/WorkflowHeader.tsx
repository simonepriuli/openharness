import { useQuery } from "@tanstack/react-query";
import { ArrowDown01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useRepoBranchesQuery } from "../../../queries/use-github";
import { useRemoteEnabled } from "../../../queries/use-remote-enabled";
import { remoteKeys } from "../../../queries/query-keys";
import { SettingsButton } from "../SettingsButton";
import { SettingsToggle } from "../SettingsToggle";
import { WorkflowBranchPicker } from "./WorkflowBranchPicker";
import { WorkflowRepoPicker } from "./WorkflowRepoPicker";

type WorkflowHeaderProps = {
  name: string;
  enabled: boolean;
  owner: string;
  repo: string;
  connectionId: string;
  targetBranch: string;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  showPlay?: boolean;
  canPlay?: boolean;
  playing?: boolean;
  onPlay?: () => void;
  onNameChange: (name: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRepoChange: (owner: string, repo: string) => void;
  onBranchChange: (branch: string) => void;
};

export function WorkflowHeader({
  name,
  enabled,
  owner,
  repo,
  connectionId,
  targetBranch,
  saving,
  canSave,
  onSave,
  showPlay = false,
  canPlay = false,
  playing = false,
  onPlay,
  onNameChange,
  onToggleEnabled,
  onRepoChange,
  onBranchChange,
}: WorkflowHeaderProps) {
  const [repoOpen, setRepoOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const remoteEnabled = useRemoteEnabled(Boolean(connectionId || (owner && repo)));

  const bindingsQuery = useQuery({
    queryKey: [...remoteKeys.all, "runnerBindings"],
    queryFn: () => window.harness.listRunnerBindings(),
    enabled: remoteEnabled && Boolean(connectionId || (owner && repo)),
  });

  const localBinding = (bindingsQuery.data?.bindings ?? []).find(
    (binding) =>
      binding.connectionId === connectionId ||
      (binding.owner === owner && binding.repo === repo),
  );

  const hasRepo = Boolean(owner && repo);
  const branchesQuery = useRepoBranchesQuery(owner, repo, {
    enabled: hasRepo && !targetBranch,
  });

  useEffect(() => {
    if (!hasRepo) {
      setBranchOpen(false);
    }
  }, [hasRepo]);

  useEffect(() => {
    if (!hasRepo || targetBranch) return;
    const defaultBranch = branchesQuery.data?.defaultBranch;
    if (defaultBranch) {
      onBranchChange(defaultBranch);
    }
  }, [branchesQuery.data?.defaultBranch, hasRepo, onBranchChange, targetBranch]);

  return (
    <header className="workflow-detail-header">
      <div className="workflow-detail-header-top">
        <input
          className="workflow-detail-title-input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Workflow name"
        />
        <div className="workflow-detail-header-actions">
          {showPlay ? (
            <SettingsButton
              size="sm"
              variant="secondary"
              className="workflow-detail-play-button shrink-0"
              disabled={!canPlay || playing || saving}
              aria-label={playing ? "Running workflow" : "Run now"}
              title={playing ? "Running…" : "Run now"}
              onClick={onPlay}
            >
              <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} aria-hidden />
            </SettingsButton>
          ) : null}
          <SettingsButton
            size="sm"
            className="shrink-0"
            disabled={saving || !canSave}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save"}
          </SettingsButton>
        </div>
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

        <div className="workflow-detail-repo-branch-group">
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

          {hasRepo ? (
            <div className="workflow-detail-repo">
              <button
                type="button"
                className={`workflow-detail-select-trigger${
                  targetBranch
                    ? " workflow-detail-select-trigger-selected"
                    : " workflow-detail-select-trigger-placeholder"
                }`}
                aria-expanded={branchOpen}
                onClick={() => setBranchOpen((open) => !open)}
              >
                <span className="workflow-detail-select-trigger-label">
                  {targetBranch || "Select branch"}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={14}
                  strokeWidth={1.8}
                  className="workflow-detail-select-trigger-icon"
                  aria-hidden
                />
              </button>
              <WorkflowBranchPicker
                open={branchOpen}
                owner={owner}
                repo={repo}
                branch={targetBranch}
                onClose={() => setBranchOpen(false)}
                onBranchChange={onBranchChange}
              />
            </div>
          ) : null}
        </div>

        {hasRepo ? (
          <>
            <span className="workflow-detail-meta-separator" aria-hidden />
            <span
              className={`workflow-detail-runner-status${
                localBinding ? "" : " workflow-detail-runner-status-missing"
              }`}
              title={
                localBinding
                  ? localBinding.projectPath
                  : "Add a local path under Settings → Organization → Runners"
              }
            >
              {localBinding
                ? `Runs on: ${localBinding.projectPath.split("/").pop() ?? localBinding.projectPath}`
                : "No local path on this machine"}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}
