import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import type {
  GithubRepoSummary,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowType,
} from "../../../../preload/api";
import { SettingsCard } from "./SettingsCard";

export function WorkflowsSettingsView() {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [templates, setTemplates] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async (options?: { signal?: AbortSignal }) => {
    setLoading(true);
    try {
      const result = await window.harness.getWorkflowSettings();
      if (options?.signal?.aborted) return;
      setWorkflows(result.workflows);
      setTemplates(result.templates);
      setError(null);
    } catch (err) {
      if (options?.signal?.aborted) return;
      const message = err instanceof Error ? err.message : "Failed to load workflows";
      setError(message.includes("Not signed in") ? "Sign in to manage GitHub workflows." : message);
    } finally {
      if (!options?.signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  return (
    <div className="settings-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="settings-panel-title">Workflows</h2>
          <p className="settings-muted settings-section-lead">
            GitHub automations assigned to repositories. Workflows run locally while OpenHarness is
            open and signed in.
          </p>
        </div>
        <button
          type="button"
          className="settings-button settings-button-secondary shrink-0"
          onClick={() => setCreateOpen(true)}
        >
          Create
        </button>
      </div>

      {loading ? <p className="settings-muted mt-4">Loading workflows…</p> : null}
      {error ? <p className="settings-error mt-4">{error}</p> : null}

      {!loading && workflows.length === 0 ? (
        <SettingsCard className="mt-4">
          <p className="settings-muted">
            No workflows yet. Create one from a built-in template and assign it to a repository.
          </p>
        </SettingsCard>
      ) : null}

      {!loading && workflows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <SettingsCard>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">{workflow.title}</p>
                    <p className="settings-muted text-xs font-medium">{workflow.fullName}</p>
                  </div>
                  <p className="settings-muted text-xs">{workflow.projectPath}</p>
                </div>
              </SettingsCard>
            </li>
          ))}
        </ul>
      ) : null}

      {createOpen ? (
        <CreateWorkflowDialog
          templates={templates}
          onClose={() => setCreateOpen(false)}
          onCreated={(next) => {
            setWorkflows(next);
            setCreateOpen(false);
            setError(null);
          }}
        />
      ) : null}
    </div>
  );
}

type CreateWorkflowDialogProps = {
  templates: WorkflowDefinition[];
  onClose: () => void;
  onCreated: (workflows: WorkflowInstance[]) => void;
};

function CreateWorkflowDialog({ templates, onClose, onCreated }: CreateWorkflowDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowType | null>(null);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoSummary | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingRepos(true);
      void window.harness
        .listGithubRepos({ q: query.trim() || undefined })
        .then((result) => {
          if (!cancelled) setRepos(result.repos);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load repositories");
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingRepos(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handlePickFolder = async () => {
    const result = await window.harness.pickDirectory();
    if (!result.canceled) {
      setProjectPath(result.cwd);
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !selectedRepo || !projectPath) return;
    setSubmitting(true);
    setError(null);
    setWarning(null);
    try {
      let remoteUrl: string | null = null;
      try {
        const remote = await window.harness.getGitRemoteInfo({ cwd: projectPath });
        remoteUrl = remote.remoteUrl;
      } catch {
        remoteUrl = null;
      }

      const result = await window.harness.createWorkflow({
        workflowType: selectedTemplate,
        projectPath,
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        remoteUrl,
      });
      if (result.warning) setWarning(result.warning);
      onCreated(result.workflows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="workflow-modal-overlay" onClick={onClose}>
      <div
        className="workflow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workflow-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="create-workflow-title" className="workflow-modal-title">
          Create workflow
        </h3>
        <p className="workflow-modal-subtitle">
          Choose a built-in template and assign it to a GitHub repository.
        </p>

        <div className="workflow-field">
          <span className="workflow-field-label">Template</span>
          <div className="workflow-template-list">
            {templates.map((template) => {
              const selected = selectedTemplate === template.type;
              return (
                <button
                  key={template.type}
                  type="button"
                  aria-pressed={selected}
                  className={`workflow-template-card${
                    selected ? " workflow-template-card-selected" : ""
                  }`}
                  onClick={() => setSelectedTemplate(template.type)}
                >
                  <p className="workflow-template-card-title">{template.title}</p>
                  <p className="workflow-template-card-desc">{template.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="workflow-field">
          <span className="workflow-field-label">Repository</span>
          <div className="workflow-repo-search">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              className="workflow-repo-search-icon"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name…"
              className="settings-input workflow-repo-search-input"
            />
          </div>

          <div className="workflow-repo-list">
            {loadingRepos ? (
              <p className="workflow-repo-empty">Loading repositories…</p>
            ) : repos.length === 0 ? (
              <p className="workflow-repo-empty">No repositories found.</p>
            ) : (
              repos.map((repo) => {
                const isSelected =
                  selectedRepo?.owner === repo.owner && selectedRepo?.name === repo.name;
                return (
                  <button
                    key={repo.fullName}
                    type="button"
                    aria-pressed={isSelected}
                    className={`workflow-repo-row${
                      isSelected ? " workflow-repo-row-selected" : ""
                    }`}
                    onClick={() => setSelectedRepo(repo)}
                  >
                    {repo.fullName}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="workflow-field">
          <span className="workflow-field-label">Local project folder</span>
          <div className="workflow-folder-row">
            <button
              type="button"
              className="settings-button settings-button-secondary"
              onClick={() => void handlePickFolder()}
            >
              Choose folder
            </button>
            <span className="workflow-folder-path">
              {projectPath ?? "Required for the agent to run locally"}
            </span>
          </div>
        </div>

        {warning ? <p className="settings-muted workflow-modal-feedback">{warning}</p> : null}
        {error ? <p className="settings-error workflow-modal-feedback">{error}</p> : null}

        <div className="workflow-modal-actions">
          <button
            type="button"
            className="settings-button settings-button-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-button settings-button-save"
            disabled={!selectedTemplate || !selectedRepo || !projectPath || submitting}
            onClick={() => void handleCreate()}
          >
            {submitting ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
