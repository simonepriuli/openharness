import type { LinearAgentRunSummary } from "../../../../preload/api";
import { useLinearAgentRunsQuery } from "../../queries/use-linear";
import { WorkflowRunDuration } from "../workflows/WorkflowRunDuration";
import { WorkflowRunStatusBadge } from "../workflows/WorkflowRunStatusBadge";

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

function formatTriggerLabel(trigger: string): string {
  if (trigger === "delegated") return "Delegated";
  if (trigger === "mentioned") return "Mentioned";
  if (trigger === "prompted") return "Prompted";
  return trigger;
}

function runDurationMs(run: LinearAgentRunSummary): number | null {
  const startedAt = Date.parse(run.createdAt);
  const endedAt = Date.parse(run.updatedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return Math.max(0, endedAt - startedAt);
}

export function LinearAgentRunsView() {
  const runsQuery = useLinearAgentRunsQuery(true, 50);

  if (runsQuery.isPending) {
    return <p className="settings-muted">Loading runs…</p>;
  }

  if (runsQuery.isError) {
    const message =
      runsQuery.error instanceof Error ? runsQuery.error.message : "Failed to load runs";
    return <p className="settings-error">{message}</p>;
  }

  const runs = runsQuery.data?.runs ?? [];

  return (
    <div className="workflow-history">
      <div className="workflow-history-table-wrap">
        <table className="workflow-history-table">
          <thead>
            <tr>
              <th>Issue</th>
              <th>Trigger</th>
              <th>Repository</th>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="settings-muted">
                  No runs yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.issueIdentifier ?? "—"}</td>
                  <td>{formatTriggerLabel(run.trigger)}</td>
                  <td>
                    {run.namespace}/{run.repoName}
                  </td>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>
                    <WorkflowRunStatusBadge status={run.status} />
                  </td>
                  <td>
                    <WorkflowRunDuration
                      durationMs={runDurationMs(run)}
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
