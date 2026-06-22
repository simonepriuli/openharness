import {
  Add01Icon,
  CloudIcon,
  ComputerIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowRecord } from "../../../../../preload/api";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { formatRelativeCompact } from "../../../lib/formatRelativeCompact";
import {
  useWorkflowRunsQuery,
  useWorkflowRunStatsQuery,
} from "../../../queries/use-workflows";
import { SettingsButton } from "../SettingsButton";
import {
  WorkflowListFilterTabs,
  type WorkflowListFilter,
} from "./WorkflowListFilterTabs";
import { WorkflowRunSparkline } from "./WorkflowRunSparkline";

function isMineWorkflow(workflow: WorkflowRecord, currentUserId: string | undefined): boolean {
  if (!currentUserId) return workflow.localOnly;
  return workflow.userId === currentUserId;
}

function isTeamWorkflow(workflow: WorkflowRecord): boolean {
  return !workflow.localOnly;
}

function WorkflowListScopeCell({
  filter,
  workflow,
  isAuthor,
}: {
  filter: WorkflowListFilter;
  workflow: WorkflowRecord;
  isAuthor: boolean;
}) {
  if (filter === "mine") {
    const local = workflow.localOnly;
    return (
      <td className="workflow-list-type">
        <span
          className="workflow-list-type-icon"
          title={
            local
              ? "Local — only visible to you, runs on your machines"
              : "Shared — visible to your team"
          }
          aria-label={local ? "Local workflow" : "Shared workflow"}
        >
          <HugeiconsIcon
            icon={local ? ComputerIcon : CloudIcon}
            size={15}
            strokeWidth={1.75}
          />
        </span>
      </td>
    );
  }

  return <td className="workflow-list-author">{isAuthor ? "You" : "Team"}</td>;
}

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

function formatWorkflowRepo(workflow: WorkflowRecord): string | null {
  const fullName = workflow.fullName?.trim();
  if (fullName) return fullName;
  if (workflow.owner && workflow.repo) return `${workflow.owner}/${workflow.repo}`;
  return null;
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
    <div ref={rootRef} className={`workflow-list-row-menu${open ? " is-open" : ""}`}>
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
  const [filter, setFilter] = useState<WorkflowListFilter>("mine");
  const { user } = useAuthUser();
  const statsQuery = useWorkflowRunStatsQuery();
  const runsQuery = useWorkflowRunsQuery({ limit: 100 });

  const filteredWorkflows = useMemo(() => {
    if (filter === "mine") {
      return workflows.filter((workflow) => isMineWorkflow(workflow, user?.id));
    }
    return workflows.filter((workflow) => isTeamWorkflow(workflow));
  }, [filter, user?.id, workflows]);

  const stats = statsQuery.data?.stats ?? null;
  const recentRuns = runsQuery.data?.runs ?? [];
  const successful7d = stats?.successful7d ?? 0;
  const failed7d = stats?.failed7d ?? 0;

  return (
    <div className="workflow-list">
      <div className="workflow-list-stats">
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Total Workflows</span>
          <span className="workflow-stat-value">{filteredWorkflows.length}</span>
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
        <WorkflowListFilterTabs value={filter} onChange={setFilter} />
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

      {!loading && workflows.length > 0 && filteredWorkflows.length === 0 ? (
        <div className="workflow-list-table-wrap">
          <p className="workflow-list-empty settings-muted">
            {filter === "mine"
              ? "No workflows created by you yet."
              : "No shared team workflows yet."}
          </p>
        </div>
      ) : null}

      {!loading && filteredWorkflows.length > 0 ? (
        <div className="workflow-list-table-wrap">
          <table className="workflow-list-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Repo</th>
                <th className={filter === "mine" ? "workflow-list-type-col" : undefined}>
                  {filter === "mine" ? "Type" : "Author"}
                </th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredWorkflows.map((workflow) => {
                const repoLabel = formatWorkflowRepo(workflow);
                const isAuthor = Boolean(user?.id && workflow.userId === user.id);

                return (
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
                    <td className="workflow-list-repo" title={repoLabel ?? undefined}>
                      {repoLabel ?? "—"}
                    </td>
                    <WorkflowListScopeCell
                      filter={filter}
                      workflow={workflow}
                      isAuthor={isAuthor}
                    />
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
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
