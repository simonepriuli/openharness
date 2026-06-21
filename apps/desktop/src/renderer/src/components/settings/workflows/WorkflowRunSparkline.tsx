import type { WorkflowRunSummary } from "../../../../../preload/api";

type WorkflowRunSparklineProps = {
  runs: WorkflowRunSummary[];
};

function bucketRunsByDay(runs: WorkflowRunSummary[]): number[] {
  const buckets = Array.from({ length: 7 }, () => 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const run of runs) {
    const createdAt = new Date(run.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const dayStart = new Date(createdAt);
    dayStart.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - dayStart.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays > 6) continue;
    buckets[6 - diffDays] += 1;
  }

  return buckets;
}

export function WorkflowRunSparkline({ runs }: WorkflowRunSparklineProps) {
  const buckets = bucketRunsByDay(runs);
  const max = Math.max(...buckets, 1);

  return (
    <div className="workflow-list-sparkline" aria-hidden>
      {buckets.map((count, index) => (
        <span
          key={index}
          className="workflow-list-sparkline-bar"
          style={{ height: `${Math.max(12, Math.round((count / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}
