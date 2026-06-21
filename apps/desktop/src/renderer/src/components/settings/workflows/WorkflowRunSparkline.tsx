import type { WorkflowRunSummary } from "../../../../../preload/api";

type WorkflowRunSparklineProps = {
  runs: WorkflowRunSummary[];
};

type DayBucket = {
  successful: number;
  failed: number;
};

function bucketRunsByDay(runs: WorkflowRunSummary[]): DayBucket[] {
  const buckets: DayBucket[] = Array.from({ length: 7 }, () => ({
    successful: 0,
    failed: 0,
  }));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const run of runs) {
    const createdAt = new Date(run.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const dayStart = new Date(createdAt);
    dayStart.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - dayStart.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays > 6) continue;

    const bucket = buckets[6 - diffDays]!;
    if (run.status === "done") {
      bucket.successful += 1;
    } else if (run.status === "failed") {
      bucket.failed += 1;
    }
  }

  return buckets;
}

function columnHeightPercent(total: number, maxTotal: number): number {
  if (total === 0) return 12;
  return Math.max(12, Math.round((total / maxTotal) * 100));
}

export function WorkflowRunSparkline({ runs }: WorkflowRunSparklineProps) {
  const buckets = bucketRunsByDay(runs);
  const maxTotal = Math.max(...buckets.map((bucket) => bucket.successful + bucket.failed), 1);

  return (
    <div className="workflow-list-sparkline" aria-hidden>
      {buckets.map((bucket, index) => {
        const total = bucket.successful + bucket.failed;
        const height = columnHeightPercent(total, maxTotal);
        const hasSuccess = bucket.successful > 0;
        const hasFailed = bucket.failed > 0;

        return (
          <div key={index} className="workflow-list-sparkline-column">
            <div className="workflow-list-sparkline-stack" style={{ height: `${height}%` }}>
              {hasSuccess ? (
                <span
                  className={`workflow-list-sparkline-bar workflow-list-sparkline-bar-success${
                    hasFailed ? " is-stacked" : ""
                  }`}
                  style={{ flex: bucket.successful }}
                />
              ) : null}
              {hasFailed ? (
                <span
                  className="workflow-list-sparkline-bar workflow-list-sparkline-bar-failed"
                  style={{ flex: bucket.failed }}
                />
              ) : null}
              {!hasSuccess && !hasFailed ? (
                <span className="workflow-list-sparkline-bar workflow-list-sparkline-bar-empty" />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
