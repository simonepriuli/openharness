import { useCallback, useEffect, useState } from "react";
import type { WorkflowRunStats, WorkflowRunSummary } from "../../../../../preload/api";

type WorkflowRunHistoryViewProps = {
  workflowId: string;
};

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return "—";
  if (durationMs < 60_000) return "< 1m";
  const minutes = Math.round(durationMs / 60_000);
  return `${minutes}m`;
}

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
  const [stats, setStats] = useState<WorkflowRunStats | null>(null);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResult, runsResult] = await Promise.all([
        window.harness.getWorkflowRunStats({ workflowId }),
        window.harness.listWorkflowRuns({ workflowId, limit: 50 }),
      ]);
      setStats(statsResult.stats);
      setRuns(runsResult.runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run history");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
              <th>Trigger</th>
              <th>Triggered</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="settings-muted">
                  No runs yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    {run.prNumber > 0
                      ? `PR #${run.prNumber}: ${run.triggerLabel}`
                      : run.triggerLabel}
                  </td>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>
                    <span
                      className={`workflow-run-status workflow-run-status-${run.status === "done" ? "success" : run.status === "failed" ? "failed" : "pending"}`}
                    >
                      {run.status === "done"
                        ? "Succeeded"
                        : run.status === "failed"
                          ? "Failed"
                          : run.status}
                    </span>
                  </td>
                  <td>{formatDuration(run.durationMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
