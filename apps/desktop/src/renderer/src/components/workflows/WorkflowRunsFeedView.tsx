import { useMemo, useState } from "react";
import type { WorkflowRunSummary } from "../../../../preload/api";
import { SettingsButton } from "../settings/SettingsButton";
import { useWorkflowRunsQuery } from "../../queries/use-workflows";
import { ACTIVE_WORKFLOW_RUN_STATUSES, WorkflowRunStatusBadge } from "./WorkflowRunStatusBadge";
import { WorkflowRunnerKindBadge } from "./WorkflowRunnerKindBadge";
import { WorkflowRunDuration } from "./WorkflowRunDuration";
import { WorkflowTriggerIcon } from "./WorkflowTriggerIcon";
const RUNS_PAGE_SIZE = 15;

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type WorkflowRunsFeedViewProps = {
  selectedRunId: string | null;
  onSelectRun: (run: WorkflowRunSummary) => void;
};

export function WorkflowRunsFeedView({ selectedRunId, onSelectRun }: WorkflowRunsFeedViewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  const cursor = cursors[pageIndex];
  const runsQuery = useWorkflowRunsQuery({ limit: RUNS_PAGE_SIZE, cursor });
  const nextCursor = runsQuery.data?.nextCursor ?? null;

  const loading = runsQuery.isPending && !runsQuery.data;
  // Background polls (refetchInterval) set isFetching — don't dim the table for those.
  const isFetchingPage = runsQuery.isFetching && !loading && !runsQuery.isRefetching;
  const error =
    runsQuery.error instanceof Error
      ? runsQuery.error.message
      : runsQuery.isError
        ? "Failed to load runs"
        : null;

  const runs = runsQuery.data?.runs ?? [];

  const sortedRuns = useMemo(() => {
    const active: WorkflowRunSummary[] = [];
    const rest: WorkflowRunSummary[] = [];
    for (const run of runs) {
      if (ACTIVE_WORKFLOW_RUN_STATUSES.has(run.status)) {
        active.push(run);
      } else {
        rest.push(run);
      }
    }
    return [...active, ...rest];
  }, [runs]);

  const hasPreviousPage = pageIndex > 0;
  const hasNextPage = nextCursor != null;
  const showPagination = hasPreviousPage || hasNextPage;

  const goToPreviousPage = () => {
    if (!hasPreviousPage) return;
    setPageIndex((index) => index - 1);
  };

  const goToNextPage = () => {
    if (!nextCursor) return;
    setCursors((prev) => {
      const trimmed = prev.slice(0, pageIndex + 1);
      return [...trimmed, nextCursor];
    });
    setPageIndex((index) => index + 1);
  };

  if (loading) return <p className="settings-muted mt-4">Loading runs…</p>;
  if (error) return <p className="settings-error mt-4">{error}</p>;

  return (
    <div className="workflow-history">
      <div
        className={`workflow-history-table-wrap${isFetchingPage ? " workflow-history-table-wrap-loading" : ""}`}
      >
        <table className="workflow-history-table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th className="workflow-history-col-trigger">Trigger</th>
              <th>Triggered</th>
              <th className="workflow-history-col-runner">Runner</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {sortedRuns.length === 0 ? (
              <tr>
                <td colSpan={6} className="settings-muted">
                  No runs yet.
                </td>
              </tr>
            ) : (
              sortedRuns.map((run) => (
                <tr
                  key={run.id}
                  className={
                    selectedRunId === run.id ? "workflow-history-row-selected" : undefined
                  }
                  onClick={() => onSelectRun(run)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectRun(run);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td>{run.workflowName ?? "Workflow"}</td>
                  <td className="workflow-history-col-trigger">
                    <WorkflowTriggerIcon run={run} />
                  </td>
                  <td>{formatDate(run.createdAt)}</td>
                  <td className="workflow-history-col-runner">
                    <WorkflowRunnerKindBadge run={run} />
                  </td>
                  <td>
                    <WorkflowRunStatusBadge status={run.status} />
                  </td>
                  <td>
                    <WorkflowRunDuration
                      durationMs={run.durationMs}
                      status={run.status}
                      createdAt={run.createdAt}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="workflow-history-pagination">
          <span className="settings-muted workflow-history-pagination-meta">
            Page {pageIndex + 1}
            {isFetchingPage ? " · Loading…" : null}
          </span>
          <div className="workflow-history-pagination-actions">
            <SettingsButton
              size="sm"
              variant="secondary"
              disabled={!hasPreviousPage || isFetchingPage}
              onClick={goToPreviousPage}
            >
              Previous
            </SettingsButton>
            <SettingsButton
              size="sm"
              variant="secondary"
              disabled={!hasNextPage || isFetchingPage}
              onClick={goToNextPage}
            >
              Next
            </SettingsButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
