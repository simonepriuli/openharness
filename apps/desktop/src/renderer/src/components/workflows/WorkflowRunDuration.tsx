import { useEffect, useState } from "react";
import { ACTIVE_WORKFLOW_RUN_STATUSES } from "./WorkflowRunStatusBadge";

export function formatWorkflowRunDuration(durationMs: number | null): string {
  if (durationMs == null) return "—";
  if (durationMs < 60_000) return "< 1m";
  const minutes = Math.round(durationMs / 60_000);
  return `${minutes}m`;
}

function formatLiveWorkflowRunDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function useTickingNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  return now;
}

type WorkflowRunDurationProps = {
  durationMs: number | null;
  status: string;
  createdAt: string;
  /** When true, show a live elapsed clock regardless of status. */
  live?: boolean;
};

export function WorkflowRunDuration({
  durationMs,
  status,
  createdAt,
  live,
}: WorkflowRunDurationProps) {
  const isActive = live === true || ACTIVE_WORKFLOW_RUN_STATUSES.has(status);
  const now = useTickingNow(isActive);

  if (isActive) {
    const startedAt = Date.parse(createdAt);
    const elapsedMs = Number.isFinite(startedAt)
      ? Math.max(0, now - startedAt)
      : (durationMs ?? 0);
    return (
      <span className="workflow-run-duration workflow-run-duration-live">
        {formatLiveWorkflowRunDuration(elapsedMs)}
      </span>
    );
  }

  return <span className="workflow-run-duration">{formatWorkflowRunDuration(durationMs)}</span>;
}
