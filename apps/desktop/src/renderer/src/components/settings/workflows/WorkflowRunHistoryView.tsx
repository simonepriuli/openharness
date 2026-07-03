import {
  useWorkflowRunsQuery,
  useWorkflowRunStatsQuery,
} from "../../../queries/use-workflows";
import { WorkflowRunStatusBadge } from "../../workflows/WorkflowRunStatusBadge";
import { WorkflowRunnerKindBadge } from "../../workflows/WorkflowRunnerKindBadge";
import { WorkflowRunDuration } from "../../workflows/WorkflowRunDuration";
import { WorkflowTriggerIcon } from "../../workflows/WorkflowTriggerIcon";

type WorkflowRunHistoryViewProps = {
  workflowId: string;
};

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

export function WorkflowRunHistoryView({ workflowId }: WorkflowRunHistoryViewProps) {
  const statsQuery = useWorkflowRunStatsQuery(workflowId);
  const runsQuery = useWorkflowRunsQuery({ workflowId, limit: 50 });

  const loading = statsQuery.isPending || runsQuery.isPending;
  const error =
    statsQuery.isError
      ? statsQuery.error instanceof Error
        ? statsQuery.error.message
        : "Failed to load run history"
      : runsQuery.isError
        ? runsQuery.error instanceof Error
          ? runsQuery.error.message
          : "Failed to load run history"
        : null;

  const stats = statsQuery.data?.stats ?? null;
  const runs = runsQuery.data?.runs ?? [];

  if (loading) return <p className="settings-muted mt-4">Loading run history…</p>;
  if (error) return <p className="settings-error mt-4">{error}</p>;

  return (
    <div className="workflow-history">
      <div className="workflow-history-stats">
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Successful · 24h</span>
          <span className="workflow-stat-value">{stats?.successful24h ?? 0}</span>
        </div>
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Failed · 24h</span>
          <span className="workflow-stat-value">{stats?.failed24h ?? 0}</span>
        </div>
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Successful · 7d</span>
          <span className="workflow-stat-value">{stats?.successful7d ?? 0}</span>
        </div>
        <div className="workflow-stat-card">
          <span className="workflow-stat-label">Failed · 7d</span>
          <span className="workflow-stat-value">{stats?.failed7d ?? 0}</span>
        </div>
      </div>

      <div className="workflow-history-table-wrap">
        <table className="workflow-history-table">
          <thead>
            <tr>
              <th className="workflow-history-col-trigger">Trigger</th>
              <th>Triggered</th>
              <th className="workflow-history-col-runner">Runner</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="settings-muted">
                  No runs yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
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
    </div>
  );
}
