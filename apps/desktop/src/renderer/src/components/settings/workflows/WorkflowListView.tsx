import {
  Add01Icon,
  GitPullRequestIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import type {
  WorkflowRecord,
  WorkflowRunStats,
  WorkflowRunSummary,
  WorkflowTools,
} from "../../../../../preload/api";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { formatRelativeCompact } from "../../../lib/formatRelativeCompact";
import { SettingsButton } from "../SettingsButton";
import { WorkflowRunSparkline } from "./WorkflowRunSparkline";

type WorkflowListViewProps = {
  workflows: WorkflowRecord[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: (workflowId: string) => void;
  onDelete: (workflowId: string) => void;
};

function formatRate(success: number, failed: number): string {
  const total = success + failed;
  if (total === 0) return "0.0%";
  return `${((success / total) * 100).toFixed(1)}%`;
}

function workflowUsesGithub(tools: WorkflowTools, repo: string): boolean {
  return Boolean(repo) || tools.prComment || tools.prApprove || tools.prPush;
}

function WorkflowRowMenu({
  workflowName,
  onEdit,
  onDelete,
}: {
  workflowName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPanelEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="workflow-list-row-menu">
      <button
        type="button"
        className="workflow-list-row-menu-trigger"
        aria-label={`Actions for ${workflowName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.6} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Actions for ${workflowName}`}
          className={`project-row-menu-shell workspace-panel-shell ${
            panelEntered ? "is-open" : "is-closed"
          } workflow-list-row-menu-panel`}
        >
          <div className="workspace-panel workflow-list-menu-inner">
            <div className="workspace-panel-menu">
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onEdit();
                }}
              >
                <span className="workspace-panel-item-label">Edit details</span>
              </button>
              <div className="workflow-list-row-menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
              >
                <span className="workspace-panel-item-label">Delete</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowListView({
  workflows,
  loading,
  error,
  onCreate,
  onOpen,
  onDelete,
}: WorkflowListViewProps) {
  const { user } = useAuthUser();
  const [stats, setStats] = useState<WorkflowRunStats | null>(null);
  const [recentRuns, setRecentRuns] = useState<WorkflowRunSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.harness.getWorkflowRunStats(),
      window.harness.listWorkflowRuns({ limit: 100 }),
    ])
      .then(([statsResult, runsResult]) => {
        if (cancelled) return;
        setStats(statsResult.stats);
        setRecentRuns(runsResult.runs);
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setRecentRuns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workflows.length]);

  const authorName = user?.name?.trim() || "You";
  const successful7d = stats?.successful7d ?? 0;
  const failed7d = stats?.failed7d ?? 0;

  return (
    <div className="workflow-list">
      <div className="workflow-list-header">
        <div>
          <h2 className="settings-panel-title">Workflows</h2>
          <p className="settings-muted settings-section-lead">
            GitHub workflows assigned to repositories. Workflows run locally while OpenHarness is
            open and signed in.
          </p>
        </div>
      </div>

      <div className="workflow-list-stats">
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Total Workflows</span>
          <span className="workflow-stat-value">{workflows.length}</span>
        </div>
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Successful · 7d</span>
          <span className="workflow-stat-value">{successful7d}</span>
          <span className="workflow-stat-subvalue">{formatRate(successful7d, failed7d)}</span>
        </div>
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Failed · 7d</span>
          <span className="workflow-stat-value">{failed7d}</span>
          <span className="workflow-stat-subvalue">{formatRate(failed7d, successful7d)}</span>
        </div>
        <div className="workflow-stat-card workflow-stat-card-chart">
          <span className="workflow-stat-label">Run History</span>
          <WorkflowRunSparkline runs={recentRuns} />
        </div>
      </div>

      <div className="workflow-list-toolbar">
        <SettingsButton size="sm" className="shrink-0" onClick={onCreate}>
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden />
          New Workflow
        </SettingsButton>
      </div>

      {loading ? <p className="settings-muted">Loading workflows…</p> : null}
      {error ? <p className="settings-error">{error}</p> : null}

      {!loading && workflows.length === 0 ? (
        <div className="workflow-list-table-wrap">
          <p className="workflow-list-empty settings-muted">
            No workflows yet. Create one and assign it to a repository.
          </p>
        </div>
      ) : null}

      {!loading && workflows.length > 0 ? (
        <div className="workflow-list-table-wrap">
          <table className="workflow-list-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Author</th>
                <th>Tools</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr
                  key={workflow.id}
                  className="workflow-list-row"
                  onClick={() => onOpen(workflow.id)}
                >
                  <td>
                    <div className="workflow-list-name-cell">
                      <span className="workflow-list-name">{workflow.name}</span>
                      {!workflow.enabled ? (
                        <span className="workflow-status-pill">Inactive</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="workflow-list-author">{authorName}</td>
                  <td>
                    <div className="workflow-list-tools">
                      {workflowUsesGithub(workflow.tools, workflow.repo) ? (
                        <span className="workflow-list-tool-icon" title={workflow.fullName || "GitHub"}>
                          <HugeiconsIcon
                            icon={GitPullRequestIcon}
                            size={15}
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </span>
                      ) : (
                        <span className="workflow-list-tools-empty">—</span>
                      )}
                    </div>
                  </td>
                  <td className="workflow-list-created">
                    {formatRelativeCompact(workflow.createdAt)}
                  </td>
                  <td className="workflow-list-actions">
                    <WorkflowRowMenu
                      workflowName={workflow.name}
                      onEdit={() => onOpen(workflow.id)}
                      onDelete={() => onDelete(workflow.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
